import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ouvrir } from '../../test/application.tsx';
import { erreur, jeton, simulerServeur } from '../../test/serveur.ts';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

let enLigne = true;

beforeEach(() => {
  localStorage.clear();
  enLigne = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => enLigne);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
});

const APPAREILS = {
  devices: [
    { id: 4, device: 'Android', created_at: '2026-09-01T12:00:00Z', last_used_at: '2026-10-15T12:00:00Z', current: true },
    { id: 3, device: 'iPhone', created_at: '2026-08-20T12:00:00Z', last_used_at: '2026-10-14T12:00:00Z', current: false },
    { id: 2, device: null, created_at: '2026-07-01T12:00:00Z', last_used_at: '2026-07-02T12:00:00Z', current: false },
  ],
};

const BASE = {
  'POST /api/auth/refresh': jeton('j1'),
  'GET /api/shortages': Response.json({ shortages: [] }),
  'GET /api/account': Response.json({ email: 'fabien@exemple.fr' }),
  'GET /api/auth/devices': Response.json(APPAREILS),
};

const corps = async (requete: Request) => JSON.parse(await requete.text()) as unknown;

describe('Réglages (CdC §3.9)', () => {
  it('thème : celui du système par défaut, choix manuel retenu puis abandonné', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(BASE);
    ouvrir('/settings');

    expect(await screen.findByRole('heading', { level: 1, name: 'Réglages' })).toBeTruthy();
    const theme = screen.getByRole('radiogroup', { name: 'Thème' });
    expect(within(theme).getByRole('radio', { name: 'Système' }).getAttribute('aria-checked')).toBe('true');

    await utilisateur.click(within(theme).getByRole('radio', { name: 'Sombre' }));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(within(theme).getByRole('radio', { name: 'Sombre' }).getAttribute('aria-checked')).toBe('true');

    await utilisateur.click(within(theme).getByRole('radio', { name: 'Système' }));
    expect(localStorage.getItem('theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('compte : adresse du compte, liens vers le changement d’adresse et les catégories', async () => {
    simulerServeur(BASE);
    ouvrir('/settings');

    expect(await screen.findByText('fabien@exemple.fr')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Changer d’adresse email' }).getAttribute('href')).toBe('/settings/email');
    expect(screen.getByRole('link', { name: 'Gérer les catégories' }).getAttribute('href')).toBe('/categories');
  });

  it('mot de passe : lien de réinitialisation envoyé à l’adresse du compte', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...BASE,
      'POST /api/auth/password/forgot': Response.json({ status: 'reset_pending' }, { status: 202 }),
    });
    ouvrir('/settings');

    await screen.findByText('fabien@exemple.fr');
    await utilisateur.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));

    expect((await screen.findByRole('status', { name: 'Lien envoyé' })).textContent).toContain(
      'Un lien pour choisir un nouveau mot de passe vient d’être envoyé à fabien@exemple.fr. Il expire dans une heure.',
    );
    const [requete] = serveur.appels('POST /api/auth/password/forgot');
    expect(await corps(requete)).toEqual({ email: 'fabien@exemple.fr' });
  });

  it('appareils : cet appareil signalé, les autres déconnectables, liste relue', async () => {
    const utilisateur = userEvent.setup();
    let lectures = 0;
    const serveur = simulerServeur({
      ...BASE,
      'GET /api/auth/devices': () => {
        lectures += 1;
        return Response.json(lectures === 1 ? APPAREILS : { devices: [APPAREILS.devices[0], APPAREILS.devices[2]] });
      },
      'DELETE /api/auth/devices/3': new Response(null, { status: 204 }),
    });
    ouvrir('/settings');

    const liste = await screen.findByRole('list', { name: 'Appareils connectés' });
    const lignes = within(liste).getAllByRole('listitem');
    expect(lignes).toHaveLength(3);
    expect(lignes[0].textContent).toContain('Android');
    expect(lignes[0].textContent).toContain('Cet appareil');
    expect(within(lignes[0]).queryByRole('button')).toBeNull();
    expect(lignes[1].textContent).toContain('Dernière activité le 14 octobre 2026');
    expect(lignes[2].textContent).toContain('Appareil non reconnu');

    await utilisateur.click(within(lignes[1]).getByRole('button', { name: 'Déconnecter iPhone' }));

    expect(serveur.appels('DELETE /api/auth/devices/3')).toHaveLength(1);
    await vi.waitFor(() => expect(within(liste).getAllByRole('listitem')).toHaveLength(2));
    expect(liste.textContent).not.toContain('iPhone');
  });

  it('déconnexion : session fermée côté serveur, retour à la connexion, compte oublié', async () => {
    const utilisateur = userEvent.setup();
    localStorage.setItem('invintory.compte', 'u-1');
    const serveur = simulerServeur({ ...BASE, 'POST /api/auth/logout': new Response(null, { status: 204 }) });
    ouvrir('/settings');

    await utilisateur.click(await screen.findByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(serveur.appels('POST /api/auth/logout')).toHaveLength(1);
    expect(localStorage.getItem('invintory.compte')).toBeNull();
  });

  it('export : archive téléchargée sous le nom donné par le serveur', async () => {
    const utilisateur = userEvent.setup();
    const creer = vi.fn(() => 'blob:export');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: creer, revokeObjectURL: vi.fn() }));
    const telechargements: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      telechargements.push(`${this.download} ${this.getAttribute('href')}`);
    });
    simulerServeur({
      ...BASE,
      'GET /api/export': new Response(new Uint8Array([80, 75]), {
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="invintory-2026-10-15.zip"' },
      }),
    });
    ouvrir('/settings');

    await utilisateur.click(await screen.findByRole('button', { name: 'Exporter la cave' }));

    expect((await screen.findByRole('status', { name: 'Export téléchargé' })).textContent).toContain(
      'invintory-2026-10-15.zip',
    );
    expect(telechargements).toEqual(['invintory-2026-10-15.zip blob:export']);
    expect(creer).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('export refusé : erreur affichée', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({ ...BASE, 'GET /api/export': erreur(500, 'INTERNAL_ERROR', 'Erreur interne.') });
    ouvrir('/settings');

    await utilisateur.click(await screen.findByRole('button', { name: 'Exporter la cave' }));

    expect((await screen.findByRole('alert', { name: 'Export impossible' })).textContent).toContain('Erreur interne.');
  });

  it('hors ligne : thème modifiable, compte, appareils et export indisponibles', async () => {
    const utilisateur = userEvent.setup();
    enLigne = false;
    const serveur = simulerServeur({ 'POST /api/auth/refresh': jeton('j1') });
    ouvrir('/settings');

    await utilisateur.click(await screen.findByRole('radio', { name: 'Clair' }));
    expect(localStorage.getItem('theme')).toBe('light');
    expect(screen.getByText('Réseau requis pour gérer le compte et exporter la cave.')).toBeTruthy();
    for (const nom of ['Changer le mot de passe', 'Se déconnecter', 'Exporter la cave']) {
      expect((screen.getByRole('button', { name: nom }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(serveur.appels('GET /api/account')).toHaveLength(0);
    expect(serveur.appels('GET /api/auth/devices')).toHaveLength(0);
  });
});

describe('Changement d’adresse email', () => {
  it('saisie vérifiée, lien de confirmation annoncé', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...BASE,
      'POST /api/account/email': Response.json({ status: 'confirmation_pending' }, { status: 202 }),
    });
    ouvrir('/settings/email');

    expect(await screen.findByRole('heading', { level: 1, name: 'Changer d’adresse email' })).toBeTruthy();
    await utilisateur.click(screen.getByRole('button', { name: 'Recevoir un lien' }));
    expect(screen.getByText('Adresse email manquante. Saisir l’adresse du compte.')).toBeTruthy();
    expect(screen.getByText('Mot de passe manquant. Saisir le mot de passe.')).toBeTruthy();
    expect(serveur.appels('POST /api/account/email')).toHaveLength(0);

    await utilisateur.type(screen.getByLabelText('Nouvelle adresse email'), 'nouvelle@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe actuel'), 'secret123');
    await utilisateur.click(screen.getByRole('button', { name: 'Recevoir un lien' }));

    expect((await screen.findByRole('status', { name: 'Lien envoyé' })).textContent).toContain(
      'Un lien de confirmation vient d’être envoyé à nouvelle@exemple.fr. L’adresse du compte change une fois ce lien ouvert.',
    );
    const [requete] = serveur.appels('POST /api/account/email');
    expect(await corps(requete)).toEqual({ email: 'nouvelle@exemple.fr', password: 'secret123' });
    expect(screen.getByRole('link', { name: 'Retour aux réglages' }).getAttribute('href')).toBe('/settings');
  });

  it('refus du serveur affiché', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...BASE,
      'POST /api/account/email': erreur(401, 'INVALID_CREDENTIALS', 'Mot de passe incorrect.'),
    });
    ouvrir('/settings/email');

    await utilisateur.type(await screen.findByLabelText('Nouvelle adresse email'), 'nouvelle@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe actuel'), 'mauvais1');
    await utilisateur.click(screen.getByRole('button', { name: 'Recevoir un lien' }));

    expect((await screen.findByRole('alert', { name: 'Changement refusé' })).textContent).toContain(
      'Mot de passe incorrect.',
    );
  });
});
