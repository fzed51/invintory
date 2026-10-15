import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Manque } from '../../categories/categories.ts';
import { BaseHorsLigne } from '../../hors-ligne/base.ts';
import { ouvrir } from '../../test/application.tsx';
import { BOUTEILLES, CAVE } from '../../test/cave.ts';
import { jeton, jwt, reseauCoupe, simulerServeur } from '../../test/serveur.ts';

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

const MANQUES: Manque[] = [
  {
    category: { id: 2, type: 'rouge', region: { id: 5, name: 'Bordeaux' } },
    threshold: 3,
    count: 1,
    missing: 2,
    suggestions: [
      {
        domain: 'Château Exemple',
        vintage: 2018,
        region: 'Bordeaux',
        grape: 'Merlot',
        last_movement_at: '2026-09-01T12:00:00.000Z',
      },
      { domain: 'Clos Ancien', vintage: null, region: 'Bordeaux', grape: null, last_movement_at: null },
    ],
  },
  { category: { id: 7, type: 'blanc', region: null }, threshold: 6, count: 5, missing: 1, suggestions: [] },
];

const LECTURES = {
  'POST /api/auth/refresh': jeton('j1'),
  'GET /api/cellar': Response.json(CAVE),
  'GET /api/bottles': Response.json({ bottles: BOUTEILLES }),
};

const navigation = () => screen.getByRole('navigation', { name: 'Navigation principale' });

describe('Pastille des manques (CdC §3.7)', () => {
  it('compte les catégories en manque, sur tous les écrans', async () => {
    simulerServeur({ ...LECTURES, 'GET /api/shortages': Response.json({ shortages: MANQUES }) });

    ouvrir('/meals');

    expect(await screen.findByLabelText('2 catégories en manque')).toBeTruthy();
    expect(within(navigation()).getByRole('link', { name: /Manques/ }).textContent).toContain('2');
  });

  it('aucune catégorie en manque : pas de pastille', async () => {
    const serveur = simulerServeur({ ...LECTURES, 'GET /api/shortages': Response.json({ shortages: [] }) });

    ouvrir('/meals');

    await vi.waitFor(() => expect(serveur.appels('GET /api/shortages')).toHaveLength(1));
    await screen.findByText('4 bouteilles');
    expect(screen.queryByLabelText(/en manque/)).toBeNull();
  });

  it('relue à chaque changement d’écran', async () => {
    const utilisateur = userEvent.setup();
    let manques = MANQUES;
    simulerServeur({ ...LECTURES, 'GET /api/shortages': () => Response.json({ shortages: manques }) });
    ouvrir('/meals');
    expect(await screen.findByLabelText('2 catégories en manque')).toBeTruthy();

    manques = MANQUES.slice(1);
    await utilisateur.click(within(navigation()).getByRole('link', { name: 'Cave' }));

    expect(await screen.findByLabelText('1 catégorie en manque')).toBeTruthy();
  });
});

describe('Écran Manques (CdC §3.7)', () => {
  it('chaque catégorie en manque : quantité manquante et suggestions, de la plus récente à la plus ancienne', async () => {
    simulerServeur({ 'POST /api/auth/refresh': jeton('j1'), 'GET /api/shortages': Response.json({ shortages: MANQUES }) });

    ouvrir('/shortages');

    expect(await screen.findByRole('heading', { level: 1, name: 'Manques' })).toBeTruthy();
    const bordeaux = await screen.findByRole('status', { name: 'Rouge · Bordeaux sous son seuil' });
    expect(bordeaux.textContent).toContain('Il manque 2 bouteilles pour atteindre 3.');
    const blanc = screen.getByRole('status', { name: 'Blanc sous son seuil' });
    expect(blanc.textContent).toContain('Il manque 1 bouteille pour atteindre 6.');

    const deja = screen.getByRole('region', { name: 'Rouge · Bordeaux' });
    const vins = within(deja).getAllByRole('listitem');
    expect(vins.map((vin) => within(vin).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Château Exemple',
      'Clos Ancien',
    ]);
    expect(vins[0].textContent).toContain('Bordeaux · Merlot · 2018');
    expect(vins[0].textContent).toContain('Dernier mouvement le 1 septembre 2026');
    expect(vins[1].textContent).toContain('Bordeaux · non millésimé');
    expect(within(screen.getByRole('region', { name: 'Blanc' })).getByText('Aucun vin de cette catégorie dans l’historique.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gérer les catégories' }).getAttribute('href')).toBe('/categories');
  });

  it('aucune catégorie sous son seuil', async () => {
    simulerServeur({ 'POST /api/auth/refresh': jeton('j1'), 'GET /api/shortages': Response.json({ shortages: [] }) });

    ouvrir('/shortages');

    expect(await screen.findByText('Aucune catégorie sous son seuil.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gérer les catégories' })).toBeTruthy();
  });

  it('hors ligne : dernière copie locale, pastille comprise', async () => {
    const compte = crypto.randomUUID();
    const base = new BaseHorsLigne(compte);
    await base.lectures.put({ route: '/api/shortages', corps: { shortages: MANQUES }, recueLe: '2026-10-09T18:00:00.000Z' });
    base.close();
    enLigne = false;
    simulerServeur({
      'POST /api/auth/refresh': Response.json({ access_token: jwt(compte), expires_in: 900 }),
      'GET /api/shortages': reseauCoupe,
    });

    ouvrir('/shortages');

    expect(await screen.findByRole('status', { name: 'Rouge · Bordeaux sous son seuil' })).toBeTruthy();
    expect(screen.getByLabelText('2 catégories en manque')).toBeTruthy();
  });

  it('serveur injoignable sans copie : le dit', async () => {
    simulerServeur({ 'POST /api/auth/refresh': jeton('j1'), 'GET /api/shortages': reseauCoupe });

    ouvrir('/shortages');

    expect(await screen.findByRole('alert', { name: 'Manques indisponibles' })).toBeTruthy();
  });
});
