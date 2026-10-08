import { expect, test } from '@playwright/test';

import { compteConnecte } from './compte';

// Catégories et manques (contrat §9) à travers Apache + PHP-FPM + MySQL de la doublure
// Docker. Les mouvements n'ont pas de route avant /sync (étape 3d) : ils sont couverts par
// PHPUnit sur la même base.

type Categorie = { id: number; type: string; region: { id: number; name: string } | null; threshold: number | null };

test('catégories : création, doublon refusé, modification, manques, suppression', async ({ request }) => {
  const headers = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };

  const generique = await request.post('/api/categories', { headers, data: { type: 'rouge', threshold: 2 } });
  expect(generique.status()).toBe(201);
  const rouge = (await generique.json()) as Categorie;
  const bordeaux = (await (
    await request.post('/api/categories', { headers, data: { type: 'rouge', region: 'Bordeaux', ageing_years: 12 } })
  ).json()) as Categorie;
  expect(bordeaux.region?.name).toBe('Bordeaux');

  const doublon = await request.post('/api/categories', { headers, data: { type: 'rouge', region: null } });
  expect(doublon.status()).toBe(409);
  expect(((await doublon.json()) as { error: { code: string } }).error.code).toBe('CATEGORY_EXISTS');

  const manques = await request.get('/api/shortages', { headers });
  expect(manques.headers()['cache-control']).toBe('no-store');
  expect(await manques.json()).toEqual({
    shortages: [
      {
        category: { id: rouge.id, type: 'rouge', region: null },
        threshold: 2,
        count: 0,
        missing: 2,
        suggestions: [],
      },
    ],
  });

  const modifiee = await request.patch(`/api/categories/${rouge.id}`, { headers, data: { threshold: null } });
  expect(((await modifiee.json()) as Categorie).threshold).toBeNull();
  expect(await (await request.get('/api/shortages', { headers })).json()).toEqual({ shortages: [] });

  expect((await request.delete(`/api/categories/${bordeaux.id}`, { headers })).status()).toBe(204);
  const restantes = (await (await request.get('/api/categories', { headers })).json()) as { categories: Categorie[] };
  expect(restantes.categories.map((c) => c.id)).toEqual([rouge.id]);
});

test('isolation : les catégories d’un autre compte sont introuvables', async ({ request }) => {
  const alice = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };
  const bob = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };
  const categorie = (await (
    await request.post('/api/categories', { headers: alice, data: { type: 'blanc', threshold: 1 } })
  ).json()) as Categorie;

  expect((await request.patch(`/api/categories/${categorie.id}`, { headers: bob, data: { threshold: 9 } })).status()).toBe(404);
  expect((await request.delete(`/api/categories/${categorie.id}`, { headers: bob })).status()).toBe(404);
  expect(await (await request.get('/api/categories', { headers: bob })).json()).toEqual({ categories: [] });
  expect(await (await request.get('/api/shortages', { headers: bob })).json()).toEqual({ shortages: [] });
});
