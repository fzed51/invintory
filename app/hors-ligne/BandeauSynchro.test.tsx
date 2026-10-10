import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ouvrir } from '../test/application.tsx';
import { erreur, jeton, jwt, reseauCoupe, simulerServeur } from '../test/serveur.ts';
import { serveurSync } from '../test/sync.ts';
import { BaseHorsLigne } from './base.ts';

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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const REFRESH = 'POST /api/auth/refresh';
const SYNC = 'POST /api/sync';
const QUAND = '2026-10-07T18:40:00.000Z';

function basculer(valeur: boolean) {
  enLigne = valeur;
  act(() => {
    window.dispatchEvent(new Event(valeur ? 'online' : 'offline'));
  });
}

/** Compte neuf : sa base, et un serveur dont le jeton porte ce compte. */
function compte(routes: Parameters<typeof simulerServeur>[0] = {}) {
  const id = crypto.randomUUID();
  const serveur = simulerServeur({
    [REFRESH]: Response.json({ access_token: jwt(id), expires_in: 900 }),
    ...routes,
  });
  return { base: new BaseHorsLigne(id), serveur };
}

const ajout = (n: number) => ({
  kind: 'add',
  occurred_at: QUAND,
  bottles: Array.from({ length: n }, (_, i) => ({ client_ref: `b${i}` })),
  fields: { type: 'rouge', entry_date: '2026-10', origin: 'achetee' },
  location: { type: 'hors_rangement' },
});
const sortie = { kind: 'exit', occurred_at: QUAND, bottle: 'b0', exit_reason: 'consommee' };

describe('Bandeau de synchronisation', () => {
  it('en ligne, rien en attente : aucun bandeau', async () => {
    compte();

    ouvrir('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();
    await new Promise((fin) => setTimeout(fin, 20));
    expect(screen.queryByText('Hors ligne')).toBeNull();
    expect(screen.queryByText('En attente de synchronisation')).toBeNull();
  });

  it('hors ligne, rien en attente : le dit, les modifications partiront au retour du réseau', async () => {
    enLigne = false;
    compte({ [SYNC]: reseauCoupe });

    ouvrir('/');

    const bandeau = (await screen.findByText('Hors ligne')).closest('.ivt-banner') as HTMLElement;
    expect(bandeau.getAttribute('role')).toBe('status');
    expect(bandeau.textContent).toContain('Les modifications seront envoyées au retour du réseau.');
  });

  it('hors ligne : compte les mouvements (une bouteille par mouvement) et les photos en attente', async () => {
    enLigne = false;
    const { base } = compte({ [SYNC]: reseauCoupe, 'PUT /api/photos/m1': reseauCoupe });
    await base.file.bulkAdd([
      { client_ref: 'm1', schemaVersion: 1, mutation: ajout(6) },
      { client_ref: 'm2', schemaVersion: 1, mutation: sortie },
    ]);
    await base.photos.put({ client_ref: 'm1', blob: new Blob(['x'], { type: 'image/jpeg' }) });

    ouvrir('/');

    const bandeau = (await screen.findByText('Hors ligne')).closest('.ivt-banner') as HTMLElement;
    await vi.waitFor(() => expect(bandeau.textContent).toContain('7 mouvements en attente de synchronisation.'));
    expect(bandeau.textContent).toContain('1 photo en attente d’envoi.');
  });

  it('accords : un mouvement, plusieurs photos', async () => {
    enLigne = false;
    const { base } = compte({ [SYNC]: reseauCoupe });
    await base.file.add({ client_ref: 'm2', schemaVersion: 1, mutation: sortie });
    await base.photos.bulkPut([
      { client_ref: 'b1', blob: new Blob(['x'], { type: 'image/jpeg' }) },
      { client_ref: 'b2', blob: new Blob(['y'], { type: 'image/jpeg' }) },
    ]);

    ouvrir('/');

    const bandeau = (await screen.findByText('Hors ligne')).closest('.ivt-banner') as HTMLElement;
    await vi.waitFor(() => expect(bandeau.textContent).toContain('1 mouvement en attente de synchronisation.'));
    expect(bandeau.textContent).toContain('2 photos en attente d’envoi.');
  });

  it('coupure puis retour du réseau : le bandeau apparaît, puis disparaît une fois la file envoyée', async () => {
    const sync = serveurSync();
    let reseau = true;
    const { base } = compte({ [SYNC]: (requete) => (reseau ? sync.route(requete) : reseauCoupe()) });
    ouvrir('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();

    reseau = false;
    basculer(false);
    expect(await screen.findByText('Hors ligne')).toBeTruthy();
    await base.file.add({ client_ref: 'm1', schemaVersion: 1, mutation: ajout(1) });
    await vi.waitFor(() => expect(screen.getByText(/1 mouvement en attente/)).toBeTruthy());

    reseau = true;
    basculer(true);

    await vi.waitFor(() => expect(screen.queryByText('Hors ligne')).toBeNull());
    await vi.waitFor(() => expect(screen.queryByText(/en attente/)).toBeNull());
    expect(sync.appliquees.size).toBe(1);
  });

  it('en ligne, envoi en échec (503) : « En attente de synchronisation », Réessayer renvoie la file', async () => {
    const utilisateur = userEvent.setup();
    const sync = serveurSync();
    let disponible = false;
    const { base } = compte({
      [SYNC]: (requete) => (disponible ? sync.route(requete) : erreur(503, 'INTERNAL_ERROR', 'Erreur interne.')),
    });
    await base.file.add({ client_ref: 'm1', schemaVersion: 1, mutation: ajout(2) });

    ouvrir('/');

    const bandeau = (await screen.findByText('En attente de synchronisation')).closest('.ivt-banner') as HTMLElement;
    expect(bandeau.textContent).toContain('2 mouvements en attente de synchronisation.');
    disponible = true;
    await utilisateur.click(within(bandeau).getByRole('button', { name: 'Réessayer' }));

    await vi.waitFor(() => expect(screen.queryByText('En attente de synchronisation')).toBeNull());
    expect(await base.file.count()).toBe(0);
  });

  it('modifications refusées : listées avec leur motif ; Fermer les oublie', async () => {
    const utilisateur = userEvent.setup();
    const { base } = compte();
    await base.rejets.bulkAdd([
      { client_ref: 'm1', kind: 'exit', code: 'BOTTLE_EXITED', message: 'Bouteille déjà sortie.', rejeteLe: QUAND },
      { client_ref: 'b1', kind: 'photo', code: 'PAYLOAD_TOO_LARGE', message: 'Photo trop lourde.', rejeteLe: QUAND },
    ]);

    ouvrir('/');

    const bandeau = (await screen.findByText('Modifications refusées')).closest('.ivt-banner') as HTMLElement;
    expect(bandeau.classList.contains('ivt-banner--warning')).toBe(true);
    expect(bandeau.textContent).toContain('2 modifications refusées par le serveur, non enregistrées :');
    expect(within(bandeau).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Bouteille déjà sortie.',
      'Photo trop lourde.',
    ]);

    await utilisateur.click(within(bandeau).getByRole('button', { name: 'Fermer' }));

    await vi.waitFor(() => expect(screen.queryByText('Modifications refusées')).toBeNull());
    expect(await base.rejets.count()).toBe(0);
  });

  it('sans données hors ligne (jeton sans compte), hors ligne : le bandeau le dit quand même', async () => {
    enLigne = false;
    simulerServeur({ [REFRESH]: jeton('opaque') });

    ouvrir('/');

    expect(await screen.findByText('Hors ligne')).toBeTruthy();
  });
});
