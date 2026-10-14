import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bouteille } from '../../cave/types.ts';
import { BaseHorsLigne } from '../../hors-ligne/base.ts';
import { ouvrir } from '../../test/application.tsx';
import { bouteille, CAVE } from '../../test/cave.ts';
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

const ETAGERE = { type: 'etagere', id: 12, cabinet_id: 3, label: 'Cave du bas · Étagère 1' } as const;

/** Cave du repas : trois rouges et un blanc, dans un ordre qui n'est aucun des deux tris. */
const BOUTEILLES: Bouteille[] = [
  bouteille(41, 'a7', ETAGERE, {
    domain: 'Château Récent',
    region: { id: 5, name: 'Bordeaux' },
    grape: { id: 9, name: 'Merlot' },
    drink_by: '2032-12-31',
    age_year: 2020,
    vintage: 2020,
  }),
  bouteille(42, 'a8', ETAGERE, {
    domain: 'Clos Urgent',
    region: { id: 5, name: 'Bordeaux' },
    drink_by: '2025-12-31',
    age_year: 2015,
    vintage: 2015,
    urgent: true,
  }),
  bouteille(43, 'b2', ETAGERE, {
    domain: 'Domaine Ancien',
    region: { id: 6, name: 'Alsace' },
    grape: { id: 7, name: 'Pinot noir' },
    drink_by: '2028-12-31',
    age_year: 2010,
    vintage: 2010,
    souvenir: true,
  }),
  bouteille(44, 'c9', ETAGERE, {
    type: 'blanc',
    domain: 'Blanc Sec',
    region: { id: 6, name: 'Alsace' },
    grape: { id: 8, name: 'Riesling' },
    drink_by: '2027-12-31',
    age_year: 2022,
    vintage: 2022,
  }),
];

const LECTURES = {
  'POST /api/auth/refresh': jeton('j1'),
  'GET /api/cellar': Response.json(CAVE),
  'GET /api/bottles': Response.json({ bottles: BOUTEILLES }),
};

/** Domaines des bouteilles affichées, dans l'ordre. */
const domaines = () => screen.getAllByRole('heading', { level: 3 }).map((titre) => titre.textContent);

describe('Repas (CdC §3.6)', () => {
  it('par défaut : toutes les bouteilles en cave, à boire en priorité (date limite la plus proche d’abord)', async () => {
    simulerServeur(LECTURES);

    ouvrir('/meals');

    expect(await screen.findByRole('heading', { level: 1, name: 'Repas' })).toBeTruthy();
    expect(await screen.findByText('4 bouteilles')).toBeTruthy();
    expect(domaines()).toEqual(['Clos Urgent', 'Blanc Sec', 'Domaine Ancien', 'Château Récent']);
    const tri = screen.getByRole('radiogroup', { name: 'Trier par' });
    expect(within(tri).getByRole('radio', { name: 'À boire en priorité' }).getAttribute('aria-checked')).toBe('true');
  });

  it('badges « À boire d’urgence » et « Souvenir » sur les bouteilles concernées, liens vers les fiches', async () => {
    simulerServeur(LECTURES);

    ouvrir('/meals');

    const urgente = (await screen.findByRole('link', { name: /Clos Urgent/ })) as HTMLAnchorElement;
    expect(within(urgente).getByText("À boire d'urgence")).toBeTruthy();
    expect(urgente.getAttribute('href')).toBe('/bottles/42');
    const souvenir = screen.getByRole('link', { name: /Domaine Ancien/ });
    expect(within(souvenir).getByText('Souvenir')).toBeTruthy();
  });

  it('par âge : les plus vieilles d’abord ; le badge d’urgence reste affiché', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(LECTURES);
    ouvrir('/meals');
    await screen.findByText('4 bouteilles');

    await utilisateur.click(screen.getByRole('radio', { name: 'Par âge' }));

    expect(domaines()).toEqual(['Domaine Ancien', 'Clos Urgent', 'Château Récent', 'Blanc Sec']);
    expect(screen.getByText("À boire d'urgence")).toBeTruthy();
  });

  it('filtres type, région et cépage combinés ; choix proposés d’après la cave', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(LECTURES);
    ouvrir('/meals');
    await screen.findByText('4 bouteilles');

    const region = screen.getByLabelText('Région') as HTMLSelectElement;
    expect([...region.options].map((o) => o.textContent)).toEqual(['Toutes les régions', 'Alsace', 'Bordeaux']);
    const cepage = screen.getByLabelText('Cépage') as HTMLSelectElement;
    expect([...cepage.options].map((o) => o.textContent)).toEqual([
      'Tous les cépages',
      'Merlot',
      'Pinot noir',
      'Riesling',
    ]);

    await utilisateur.selectOptions(screen.getByLabelText('Type'), 'Rouge');
    expect(domaines()).toEqual(['Clos Urgent', 'Domaine Ancien', 'Château Récent']);

    await utilisateur.selectOptions(region, 'Bordeaux');
    expect(domaines()).toEqual(['Clos Urgent', 'Château Récent']);

    await utilisateur.selectOptions(cepage, 'Merlot');
    expect(domaines()).toEqual(['Château Récent']);
    expect(screen.getByText('1 bouteille')).toBeTruthy();
  });

  it('aucune bouteille ne correspond : le dit, et « Effacer les filtres » rend toute la cave', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(LECTURES);
    ouvrir('/meals');
    await screen.findByText('4 bouteilles');

    await utilisateur.selectOptions(screen.getByLabelText('Type'), 'Effervescent');

    expect(screen.getByText('Aucune bouteille ne correspond à ces filtres.')).toBeTruthy();
    await utilisateur.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(screen.getByText('4 bouteilles')).toBeTruthy();
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('');
  });

  it('filtres et tri gardés dans l’adresse : retrouvés en revenant d’une fiche', async () => {
    simulerServeur(LECTURES);

    ouvrir('/meals?type=rouge&region=Alsace&sort=age');

    expect(await screen.findByText('1 bouteille')).toBeTruthy();
    expect(domaines()).toEqual(['Domaine Ancien']);
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('rouge');
    expect((screen.getByLabelText('Région') as HTMLSelectElement).value).toBe('Alsace');
    expect(screen.getByRole('radio', { name: 'Par âge' }).getAttribute('aria-checked')).toBe('true');
  });

  it('cave vide : le dit, sans filtres', async () => {
    simulerServeur({ ...LECTURES, 'GET /api/bottles': Response.json({ bottles: [] }) });

    ouvrir('/meals');

    expect(await screen.findByText('Aucune bouteille en cave.')).toBeTruthy();
    expect(screen.queryByLabelText('Type')).toBeNull();
  });

  it('hors ligne : cherche dans la dernière copie locale de la cave', async () => {
    const compte = crypto.randomUUID();
    const base = new BaseHorsLigne(compte);
    const recueLe = '2026-10-09T18:00:00.000Z';
    await base.lectures.bulkPut([
      { route: '/api/cellar', corps: CAVE, recueLe },
      { route: '/api/bottles', corps: { bottles: BOUTEILLES }, recueLe },
    ]);
    base.close();
    enLigne = false;
    simulerServeur({
      'POST /api/auth/refresh': Response.json({ access_token: jwt(compte), expires_in: 900 }),
      'GET /api/cellar': reseauCoupe,
      'GET /api/bottles': reseauCoupe,
    });

    ouvrir('/meals?type=blanc');

    expect(await screen.findByText('1 bouteille')).toBeTruthy();
    expect(domaines()).toEqual(['Blanc Sec']);
  });
});
