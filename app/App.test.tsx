import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ouvrir } from './test/application.tsx';
import { erreur, jeton, reseauCoupe, simulerServeur } from './test/serveur.ts';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REFRESH = 'POST /api/auth/refresh';
const SANS_SESSION = { [REFRESH]: erreur(401, 'SESSION_INVALID', 'Session expirée. Reconnectez-vous.') };
const AVEC_SESSION = { [REFRESH]: jeton('j1') };

function onglets() {
  return within(screen.getByRole('navigation', { name: 'Navigation principale' }));
}

describe('App : session et routage', () => {
  it('sans session, toute adresse de l’application mène à la connexion', async () => {
    simulerServeur(SANS_SESSION);

    ouvrir('/meals');

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Invintory' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('pendant la vérification de la session, aucun écran n’est montré', () => {
    simulerServeur({ [REFRESH]: () => new Promise<Response>(() => {}) });

    ouvrir('/');

    expect(screen.getByRole('status').textContent).toContain('Ouverture de la session');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Se connecter' })).toBeNull();
  });

  it('avec une session, ouvre la cave dans la coque, onglet Cave actif', async () => {
    simulerServeur(AVEC_SESSION);

    ouvrir('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();
    expect(onglets().getByRole('link', { name: 'Cave' }).getAttribute('aria-current')).toBe('page');
  });

  it.each([
    ['/meals', 'Repas', 'Repas'],
    ['/add', 'Ajouter une bouteille', 'Ajouter une bouteille'],
    ['/shortages', 'Manques', 'Manques'],
    ['/settings', 'Réglages', 'Réglages'],
  ])('%s : écran « %s », onglet actif', async (chemin, titre, onglet) => {
    simulerServeur(AVEC_SESSION);

    ouvrir(chemin);

    expect(await screen.findByRole('heading', { level: 1, name: titre })).toBeTruthy();
    expect(onglets().getByRole('link', { name: onglet }).getAttribute('aria-current')).toBe('page');
  });

  it('la barre de navigation change d’écran', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(AVEC_SESSION);
    ouvrir('/');
    await screen.findByRole('heading', { level: 1, name: 'Cave' });

    await utilisateur.click(onglets().getByRole('link', { name: 'Réglages' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeTruthy();
    expect(onglets().getByRole('link', { name: 'Réglages' }).getAttribute('aria-current')).toBe('page');
  });

  it('avec une session, les écrans de connexion renvoient à la cave', async () => {
    simulerServeur(AVEC_SESSION);

    ouvrir('/login');

    expect(await screen.findByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();
  });

  it('serveur injoignable au démarrage : la coque s’ouvre (session présumée, hors ligne)', async () => {
    simulerServeur({ [REFRESH]: reseauCoupe });

    ouvrir('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();
  });

  it('session terminée en cours d’usage : retour à la connexion', async () => {
    let valide = true;
    simulerServeur({
      [REFRESH]: () => (valide ? jeton('j1') : erreur(401, 'SESSION_INVALID', 'Session expirée.')),
    });
    const { client } = ouvrir('/meals');
    await screen.findByRole('heading', { level: 1, name: 'Repas' });

    valide = false;
    await act(() => client.rafraichir());

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
  });

  it('adresse inconnue : page introuvable avec un lien vers la cave', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(AVEC_SESSION);
    ouvrir('/nulle-part');

    expect(await screen.findByRole('heading', { level: 1, name: 'Page introuvable' })).toBeTruthy();
    await utilisateur.click(screen.getByRole('link', { name: 'Revenir à la cave' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();
  });
});

describe('Connexion', () => {
  it('connecte puis ouvre l’écran demandé au départ', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({ ...SANS_SESSION, 'POST /api/auth/login': jeton('j1') });
    ouvrir('/meals');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'a@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'motdepasse-solide');
    await utilisateur.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Repas' })).toBeTruthy();
    expect(await serveur.appels('POST /api/auth/login')[0].json()).toEqual({
      email: 'a@exemple.fr',
      password: 'motdepasse-solide',
    });
  });

  it('refus : message du serveur, on reste sur la connexion', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...SANS_SESSION,
      'POST /api/auth/login': erreur(401, 'INVALID_CREDENTIALS', 'Identifiants incorrects.'),
    });
    ouvrir('/login');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'a@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'faux');
    await utilisateur.click(screen.getByRole('button', { name: 'Se connecter' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Connexion refusée');
    expect(alerte.textContent).toContain('Identifiants incorrects.');
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
  });

  it('réseau coupé : le dit, sans conclure sur les identifiants', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({ ...SANS_SESSION, 'POST /api/auth/login': reseauCoupe });
    ouvrir('/login');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'a@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'motdepasse-solide');
    await utilisateur.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Connexion au serveur impossible.');
  });

  it('bouton désactivé pendant l’envoi', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({ ...SANS_SESSION, 'POST /api/auth/login': () => new Promise<Response>(() => {}) });
    ouvrir('/login');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'a@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'motdepasse-solide');
    await utilisateur.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect((screen.getByRole('button', { name: 'Se connecter' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mène à l’inscription et au mot de passe oublié', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(SANS_SESSION);
    ouvrir('/login');

    await utilisateur.click(await screen.findByRole('link', { name: 'Créer un compte' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Créer un compte' })).toBeTruthy();

    await utilisateur.click(screen.getByRole('link', { name: 'Se connecter' }));
    await utilisateur.click(screen.getByRole('link', { name: 'Mot de passe oublié' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Mot de passe oublié' })).toBeTruthy();
  });
});
