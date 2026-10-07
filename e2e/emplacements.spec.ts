import { expect, test, type APIRequestContext } from '@playwright/test';

import { compteConnecte } from './compte';

// Emplacements (contrat §5) à travers Apache + PHP-FPM + MySQL de la doublure Docker. Les
// bouteilles n'ont pas encore d'API (étapes 3b–3c) : la bascule d'un emplacement non vide
// est couverte par PHPUnit sur la même base MySQL.

type Etagere = { id: number; name: string | null; position: number; capacity: number; occupied: number };
type Armoire = { id: number; name: string; shelves: Etagere[] };

function appels(request: APIRequestContext, jeton: string) {
  const headers = { Authorization: `Bearer ${jeton}` };
  return {
    get: (chemin: string) => request.get(chemin, { headers }),
    head: (chemin: string) => request.head(chemin, { headers }),
    post: (chemin: string, data: unknown) => request.post(chemin, { headers, data }),
    patch: (chemin: string, data: unknown) => request.patch(chemin, { headers, data }),
    delete: (chemin: string) => request.delete(chemin, { headers }),
  };
}

test('aménager sa cave : armoire, étagères, carton, suggestion, suppression', async ({ request }) => {
  const api = appels(request, (await compteConnecte(request)).jeton);

  const creation = await api.post('/api/cabinets', {
    name: 'Cave du bas',
    shelves: [{ capacity: 2 }, { name: 'Étagère du haut', capacity: 3 }],
  });
  expect(creation.status()).toBe(201);
  const armoire = (await creation.json()) as Armoire;
  const [basse, haute] = armoire.shelves;
  expect(armoire.shelves.map((e) => [e.name, e.position, e.capacity, e.occupied])).toEqual([
    [null, 1, 2, 0],
    ['Étagère du haut', 2, 3, 0],
  ]);

  const carton = await api.post('/api/boxes', { label: 'Carton Bordeaux', capacity: 6 });
  expect(carton.status()).toBe(201);

  // L'étagère du haut passe devant : elle devient la première suggestion.
  expect((await api.patch(`/api/shelves/${haute?.id}`, { position: 0 })).status()).toBe(200);
  const suggestion = await api.get('/api/locations/suggestion?count=3');
  expect(suggestion.headers()['cache-control']).toBe('no-store');
  expect(await suggestion.json()).toEqual({
    location: { type: 'etagere', id: haute?.id, cabinet_id: armoire.id, label: 'Cave du bas · Étagère du haut' },
    free: 3,
  });

  expect(await (await api.delete(`/api/shelves/${basse?.id}`)).json()).toEqual({ moved_to_unplaced: 0 });

  const cave = await api.get('/api/cellar');
  expect(cave.status()).toBe(200);
  expect(await cave.json()).toEqual({
    cabinets: [{ id: armoire.id, name: 'Cave du bas', shelves: [{ ...haute, position: 0 }] }],
    boxes: [{ id: ((await carton.json()) as { id: number }).id, label: 'Carton Bordeaux', capacity: 6, occupied: 0 }],
    unplaced: 0,
  });
  expect((await api.head('/api/cellar')).status()).toBe(200);
});

test('isolation : les emplacements d’un autre compte sont introuvables', async ({ request }) => {
  const alice = appels(request, (await compteConnecte(request)).jeton);
  const bob = appels(request, (await compteConnecte(request)).jeton);
  const armoire = (await (await alice.post('/api/cabinets', { name: 'Cave', shelves: [{ capacity: 6 }] })).json()) as Armoire;

  for (const reponse of [
    await bob.patch(`/api/cabinets/${armoire.id}`, { name: 'Prise' }),
    await bob.patch(`/api/shelves/${armoire.shelves[0]?.id}`, { capacity: 1 }),
    await bob.delete(`/api/cabinets/${armoire.id}`),
  ]) {
    expect(reponse.status()).toBe(404);
    expect(await reponse.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' } });
  }
  expect(await (await bob.get('/api/cellar')).json()).toEqual({ cabinets: [], boxes: [], unplaced: 0 });
  expect(((await (await alice.get('/api/cellar')).json()) as { cabinets: Armoire[] }).cabinets).toEqual([armoire]);
});
