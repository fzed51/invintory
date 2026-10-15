import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Categorie } from '../../categories/categories.ts';
import { BaseHorsLigne } from '../../hors-ligne/base.ts';
import { ouvrir } from '../../test/application.tsx';
import { erreur, jeton, jwt, reseauCoupe, simulerServeur } from '../../test/serveur.ts';

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

const CATEGORIES: Categorie[] = [
  { id: 2, type: 'rouge', region: { id: 5, name: 'Bordeaux' }, threshold: 3, ageing_years: 12, count: 5 },
  { id: 7, type: 'blanc', region: null, threshold: null, ageing_years: null, count: 1 },
  { id: 1, type: 'rouge', region: null, threshold: 6, ageing_years: 8, count: 9 },
];

const BASE = {
  'POST /api/auth/refresh': jeton('j1'),
  'GET /api/shortages': Response.json({ shortages: [] }),
  'GET /api/regions': Response.json({ regions: [{ id: 5, name: 'Bordeaux' }] }),
};

const corps = async (requete: Request) => JSON.parse(await requete.text()) as unknown;

describe('Catégories (CdC §2.5, §3.9)', () => {
  it('liste : dans l’ordre des types, seuil, durée de garde et bouteilles en cave', async () => {
    simulerServeur({ ...BASE, 'GET /api/categories': Response.json({ categories: CATEGORIES }) });

    ouvrir('/categories');

    expect(await screen.findByRole('heading', { level: 1, name: 'Catégories' })).toBeTruthy();
    const liens = within(await screen.findByRole('list', { name: 'Catégories' })).getAllByRole('link');
    expect(liens.map((lien) => lien.getAttribute('href'))).toEqual(['/categories/1', '/categories/2', '/categories/7']);
    expect(liens[0].textContent).toContain('Rouge');
    expect(liens[0].textContent).toContain('Seuil : 6 · Garde : 8 ans · 9 bouteilles en cave');
    expect(liens[1].textContent).toContain('Rouge · Bordeaux');
    expect(liens[2].textContent).toContain('Sans seuil · Sans durée de garde · 1 bouteille en cave');
    expect(screen.getByRole('link', { name: 'Nouvelle catégorie' }).getAttribute('href')).toBe('/categories/new');
  });

  it('aucune catégorie', async () => {
    simulerServeur({ ...BASE, 'GET /api/categories': Response.json({ categories: [] }) });

    ouvrir('/categories');

    expect(await screen.findByText('Aucune catégorie.')).toBeTruthy();
  });

  it('création : type, région, seuil et durée de garde envoyés, retour à la liste', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...BASE,
      'POST /api/categories': Response.json({ ...CATEGORIES[0], id: 9 }, { status: 201 }),
      'GET /api/categories': Response.json({ categories: CATEGORIES }),
    });
    ouvrir('/categories/new');

    await utilisateur.selectOptions(await screen.findByLabelText('Type'), 'rouge');
    await utilisateur.type(screen.getByLabelText('Région (facultative)'), 'Bordeaux');
    await utilisateur.type(screen.getByLabelText('Seuil minimum (facultatif)'), '3');
    await utilisateur.type(screen.getByLabelText('Durée de garde en années (facultative)'), '12');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer la catégorie' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Catégories' })).toBeTruthy();
    const [requete] = serveur.appels('POST /api/categories');
    expect(await corps(requete)).toEqual({ type: 'rouge', region: 'Bordeaux', threshold: 3, ageing_years: 12 });
  });

  it('création d’une générique : sans région, seuil et garde vides envoyés à null', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...BASE,
      'POST /api/categories': Response.json(CATEGORIES[1], { status: 201 }),
      'GET /api/categories': Response.json({ categories: CATEGORIES }),
    });
    ouvrir('/categories/new');

    await utilisateur.selectOptions(await screen.findByLabelText('Type'), 'blanc');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer la catégorie' }));

    await screen.findByRole('heading', { level: 1, name: 'Catégories' });
    const [requete] = serveur.appels('POST /api/categories');
    expect(await corps(requete)).toEqual({ type: 'blanc', threshold: null, ageing_years: null });
  });

  it('création : saisie vérifiée avant l’envoi, refus du serveur affiché', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...BASE,
      'POST /api/categories': erreur(409, 'CATEGORY_EXISTS', 'Cette catégorie existe déjà.'),
    });
    ouvrir('/categories/new');

    await utilisateur.click(await screen.findByRole('button', { name: 'Créer la catégorie' }));
    expect(screen.getByText('Type manquant. Choisir le type de vin.')).toBeTruthy();
    await utilisateur.selectOptions(screen.getByLabelText('Type'), 'rouge');
    await utilisateur.type(screen.getByLabelText('Seuil minimum (facultatif)'), '2,5');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer la catégorie' }));
    expect(screen.getByText('Seuil invalide. Saisir un nombre entier de 0 à 65 535, ou laisser vide.')).toBeTruthy();
    expect(serveur.appels('POST /api/categories')).toHaveLength(0);

    await utilisateur.clear(screen.getByLabelText('Seuil minimum (facultatif)'));
    await utilisateur.click(screen.getByRole('button', { name: 'Créer la catégorie' }));

    expect((await screen.findByRole('alert', { name: 'Création refusée' })).textContent).toContain(
      'Cette catégorie existe déjà.',
    );
  });

  it('modification : seuil et durée de garde pré-remplis, vider le seuil l’envoie à null', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...BASE,
      'GET /api/categories': Response.json({ categories: CATEGORIES }),
      'PATCH /api/categories/2': Response.json({ ...CATEGORIES[0], threshold: null, ageing_years: 15 }),
    });
    ouvrir('/categories/2');

    expect(await screen.findByRole('heading', { level: 1, name: 'Rouge · Bordeaux' })).toBeTruthy();
    expect(screen.getByText('5 bouteilles en cave')).toBeTruthy();
    const seuil = screen.getByLabelText('Seuil minimum (facultatif)');
    const garde = screen.getByLabelText('Durée de garde en années (facultative)');
    expect((seuil as HTMLInputElement).value).toBe('3');
    await utilisateur.clear(seuil);
    await utilisateur.clear(garde);
    await utilisateur.type(garde, '15');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Catégories' })).toBeTruthy();
    const [requete] = serveur.appels('PATCH /api/categories/2');
    expect(await corps(requete)).toEqual({ threshold: null, ageing_years: 15 });
  });

  it('suppression confirmée dans une feuille basse, retour à la liste', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...BASE,
      'GET /api/categories': Response.json({ categories: CATEGORIES }),
      'DELETE /api/categories/2': new Response(null, { status: 204 }),
    });
    ouvrir('/categories/2');

    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer la catégorie' }));
    const feuille = screen.getByRole('dialog', { name: 'Supprimer la catégorie' });
    expect(feuille.textContent).toContain('Les dates limites de consommation de ses bouteilles seront recalculées.');
    await utilisateur.click(within(feuille).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Catégories' })).toBeTruthy();
    expect(serveur.appels('DELETE /api/categories/2')).toHaveLength(1);
  });

  it('catégorie inconnue', async () => {
    simulerServeur({ ...BASE, 'GET /api/categories': Response.json({ categories: CATEGORIES }) });

    ouvrir('/categories/99');

    expect(await screen.findByRole('heading', { level: 1, name: 'Catégorie introuvable' })).toBeTruthy();
  });

  it('hors ligne : liste lue dans la copie locale, modifications impossibles', async () => {
    const compte = crypto.randomUUID();
    const base = new BaseHorsLigne(compte);
    await base.lectures.put({ route: '/api/categories', corps: { categories: CATEGORIES }, recueLe: '2026-10-09T18:00:00.000Z' });
    base.close();
    enLigne = false;
    simulerServeur({
      'POST /api/auth/refresh': Response.json({ access_token: jwt(compte), expires_in: 900 }),
      'GET /api/shortages': reseauCoupe,
      'GET /api/categories': reseauCoupe,
    });

    ouvrir('/categories/2');

    expect(await screen.findByRole('heading', { level: 1, name: 'Rouge · Bordeaux' })).toBeTruthy();
    expect(screen.getByText('Réseau requis pour modifier les catégories.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Supprimer la catégorie' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
