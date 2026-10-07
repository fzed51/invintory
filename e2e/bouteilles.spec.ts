import { expect, test } from '@playwright/test';

import { compteConnecte } from './compte';

// Bouteilles, référentiels et réserve de références (contrat §4, §6, §7) à travers Apache
// + PHP-FPM + MySQL de la doublure Docker. Les bouteilles ne se créent que par /sync
// (étapes 3c–3d) : leur lecture et leur édition sont couvertes par PHPUnit sur la même base.

test('réserve de références : codes à la suite, séquence propre à chaque compte', async ({ request }) => {
  const alice = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };
  const bob = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };
  const reserver = (headers: Record<string, string>, count: number) =>
    request.post('/api/references/reservations', { headers, data: { count } });

  const premiere = await reserver(alice, 3);
  expect(premiere.status()).toBe(201);
  expect(await premiere.json()).toEqual({ references: ['a0', 'a1', 'a2'] });
  expect(await (await reserver(alice, 2)).json()).toEqual({ references: ['a3', 'a4'] });
  expect(await (await reserver(bob, 1)).json()).toEqual({ references: ['a0'] });
  expect((await reserver(alice, 101)).status()).toBe(400);
});

test('lectures d’une cave sans bouteille', async ({ request }) => {
  const headers = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };

  for (const [chemin, attendu] of [
    ['/api/bottles', { bottles: [] }],
    ['/api/bottles?status=all&sort=priority', { bottles: [] }],
    ['/api/regions?q=bor', { regions: [] }],
    ['/api/grapes', { grapes: [] }],
  ] as const) {
    const reponse = await request.get(chemin, { headers });
    expect(reponse.status(), chemin).toBe(200);
    expect(reponse.headers()['cache-control']).toBe('no-store');
    expect(await reponse.json()).toEqual(attendu);
  }
  expect((await request.get('/api/bottles/by-reference/a0', { headers })).status()).toBe(404);
  expect((await request.patch('/api/bottles/1', { headers, data: { note: 'x' } })).status()).toBe(404);
  expect((await request.get('/api/bottles?sort=prix', { headers })).status()).toBe(400);
});
