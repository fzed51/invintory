import { cleanup, screen } from '@testing-library/react';
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REFRESH = 'POST /api/auth/refresh';
const SYNC = 'POST /api/sync';
const ouverte = (compte: string) => Response.json({ access_token: jwt(compte), expires_in: 900 });

/** Base d'un compte neuf, avec une sortie en file. */
async function compteAvecFile() {
  const compte = crypto.randomUUID();
  const base = new BaseHorsLigne(compte);
  await base.file.add({
    client_ref: 'm1',
    schemaVersion: 1,
    mutation: { kind: 'exit', occurred_at: '2026-10-07T18:40:00.000Z', bottle: 'b1', exit_reason: 'consommee' },
  });
  return { compte, base };
}

describe('Données hors ligne dans l’application', () => {
  it('session ouverte : la file du compte part au démarrage, le compte est retenu', async () => {
    const { compte, base } = await compteAvecFile();
    const serveur = simulerServeur({
      [REFRESH]: ouverte(compte),
      [SYNC]: Response.json({ results: [{ client_ref: 'm1', status: 'applied', movement_id: 9, redirected: null }] }),
    });

    ouvrir('/');

    await vi.waitFor(() => expect(serveur.appels(SYNC)).toHaveLength(1));
    await vi.waitFor(async () => expect(await base.file.count()).toBe(0));
    expect(localStorage.getItem('invintory.compte')).toBe(compte);
  });

  it('démarrage hors ligne : base du dernier compte connecté, envoyée au retour du réseau', async () => {
    const { compte, base } = await compteAvecFile();
    localStorage.setItem('invintory.compte', compte);
    let reseau = false;
    const serveur = simulerServeur({
      [REFRESH]: () => (reseau ? ouverte(compte) : reseauCoupe()),
      [SYNC]: Response.json({ results: [{ client_ref: 'm1', status: 'applied', movement_id: 9, redirected: null }] }),
    });
    ouvrir('/');
    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeTruthy();

    reseau = true;
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(async () => expect(await base.file.count()).toBe(0));
    expect(serveur.appels(SYNC)).toHaveLength(1);
  });

  it('connexion à un autre compte : sa propre base, la file du précédent ne part pas', async () => {
    const precedent = await compteAvecFile();
    localStorage.setItem('invintory.compte', precedent.compte);
    const autre = crypto.randomUUID();
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      [REFRESH]: erreur(401, 'SESSION_INVALID', 'Session expirée.'),
      'POST /api/auth/login': ouverte(autre),
      [SYNC]: serveurSync().route,
    });
    ouvrir('/login');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'b@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
    await utilisateur.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeTruthy();
    expect(localStorage.getItem('invintory.compte')).toBe(autre);
    await new Promise((fin) => setTimeout(fin, 20));
    expect(serveur.appels(SYNC)).toHaveLength(0);
    expect(await precedent.base.file.count()).toBe(1);
  });

  it('jeton sans compte lisible : pas de données hors ligne, aucune synchronisation', async () => {
    const serveur = simulerServeur({ [REFRESH]: jeton('opaque') });

    ouvrir('/');

    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeTruthy();
    await new Promise((fin) => setTimeout(fin, 20));
    expect(serveur.requetes.map((r) => new URL(r.url).pathname)).toEqual(['/api/auth/refresh']);
    expect(localStorage.getItem('invintory.compte')).toBeNull();
  });
});
