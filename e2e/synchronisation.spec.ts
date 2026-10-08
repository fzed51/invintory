import { expect, test, type APIRequestContext } from '@playwright/test';

import { compteConnecte } from './compte';

// Synchronisation, photos et export (contrat §10 à §12) à travers Apache + PHP-FPM + MySQL de
// la doublure Docker (GD et ZipArchive comme sur le mutualisé). Le détail (orientation EXIF,
// rejets, reconstruction des réponses rejouées, contenu de l'archive) est couvert par PHPUnit.

// JPEG 32 × 24 de quatre quarts de couleur.
const PHOTO = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2ODApLCBxdWFsaXR5ID0gOTUK' +
    '/9sAQwACAQEBAQECAQEBAgICAgIEAwICAgIFBAQDBAYFBgYGBQYGBgcJCAYHCQcGBggLCAkKCgoKCgYICwwLCgwJCgoK/9sAQwECAgICAgIF' +
    'AwMFCgcGBwoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoK/8AAEQgAGAAgAwEiAAIRAQMRAf/EAB8A' +
    'AAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHw' +
    'JDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeo' +
    'qaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkK' +
    'C//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpD' +
    'REVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW' +
    '19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A+L6K8h/4aq/6kP8A8qn/ANqo/wCGqv8AqQ//ACqf/aqn/iSX6Tv/AEIP/LrB' +
    'f/NJ/rR/xN99Hb/od/8Alti//mc/YaivtL/h0F/1cN/5aX/3XR/w6C/6uG/8tL/7rr+Bf+IJ+J3/AEAf+VaP/wAsP+Vb/iXbxj/6Fn/lbD//' +
    'AC0/lJooor/r4P7tP7iKKKK/wDP1Q//Z',
  'base64',
);

type Resultat = {
  client_ref: string;
  status: string;
  bottles?: { client_ref: string; id: number; reference: string; location: { type: string }; redirected: string | null }[];
  movement_id?: number;
  redirected?: string | null;
  error?: { code: string };
};

function uuid(): string {
  return crypto.randomUUID();
}

async function synchroniser(request: APIRequestContext, headers: Record<string, string>, mutations: object[]) {
  const reponse = await request.post('/api/sync', { headers, data: { mutations } });
  expect(reponse.status()).toBe(200);
  return ((await reponse.json()) as { results: Resultat[] }).results;
}

test('ajout en masse, rejeu sans doublon, déplacement, sortie, photo du lot, export', async ({ request }) => {
  const headers = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };
  const armoire = (await (
    await request.post('/api/cabinets', { headers, data: { name: 'Cave', shelves: [{ capacity: 1 }] } })
  ).json()) as { shelves: { id: number }[] };
  const etagere = armoire.shelves[0].id;
  const { references } = (await (
    await request.post('/api/references/reservations', { headers, data: { count: 2 } })
  ).json()) as { references: string[] };
  const [lot, b1, b2, deplacement, sortie] = [uuid(), uuid(), uuid(), uuid(), uuid()];
  const mutations = [
    {
      client_ref: lot, schema_version: 1, kind: 'add', occurred_at: '2026-10-07T18:40:00.000Z',
      bottles: [{ client_ref: b1, reference: references[0] }, { client_ref: b2, reference: references[1] }],
      fields: { type: 'rouge', region: 'Bordeaux', vintage: 2018, entry_date: '2026-10', origin: 'achetee' },
      location: { type: 'etagere', id: etagere },
    },
    {
      client_ref: deplacement, schema_version: 1, kind: 'move', occurred_at: '2026-10-07T19:00:00.000Z',
      bottle: b1, location: { type: 'hors_rangement' },
    },
    {
      client_ref: sortie, schema_version: 1, kind: 'exit', occurred_at: '2026-10-07T20:00:00.000Z',
      bottle: b2, exit_reason: 'consommee',
    },
  ];

  const premier = await synchroniser(request, headers, mutations);
  expect(premier.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
  const bouteilles = premier[0].bottles ?? [];
  expect(bouteilles.map((b) => [b.reference, b.location.type, b.redirected])).toEqual([
    [references[0], 'etagere', null],
    [references[1], 'hors_rangement', 'CAPACITY_EXCEEDED'],
  ]);

  // Le même lot renvoyé (réponse perdue) : rien n'est réappliqué.
  const second = await synchroniser(request, headers, mutations);
  expect(second).toEqual(premier.map((r) => ({ ...r, status: 'already_applied' })));
  const toutes = (await (await request.get('/api/bottles?status=all', { headers })).json()) as {
    bottles: { reference: string; status: string; has_photo: boolean }[];
  };
  expect(toutes.bottles.map((b) => [b.reference, b.status])).toEqual([
    [references[0], 'en_cave'],
    [references[1], 'sortie'],
  ]);

  // Photo commune du lot : une copie par bouteille.
  const envoi = await request.put(`/api/photos/${lot}`, {
    headers: { ...headers, 'Content-Type': 'image/jpeg' },
    data: PHOTO,
  });
  expect(envoi.status()).toBe(204);
  for (const bouteille of bouteilles) {
    for (const suffixe of ['photo', 'photo/thumbnail']) {
      const image = await request.get(`/api/bottles/${bouteille.id}/${suffixe}`, { headers });
      expect(image.status(), suffixe).toBe(200);
      expect(image.headers()['content-type']).toBe('image/jpeg');
      expect([...(await image.body()).subarray(0, 2)]).toEqual([0xff, 0xd8]);
    }
  }
  expect((await request.put(`/api/photos/${uuid()}`, { headers: { ...headers, 'Content-Type': 'image/jpeg' }, data: PHOTO })).status()).toBe(404);
  expect((await request.put(`/api/photos/${lot}`, { headers: { ...headers, 'Content-Type': 'image/png' }, data: PHOTO })).status()).toBe(415);

  const exporte = await request.get('/api/export', { headers });
  expect(exporte.status()).toBe(200);
  expect(exporte.headers()['content-type']).toBe('application/zip');
  expect(exporte.headers()['content-disposition']).toMatch(/^attachment; filename="invintory-\d{4}-\d{2}-\d{2}\.zip"$/);
  const archive = (await exporte.body()).toString('latin1');
  expect(archive.startsWith('PK')).toBe(true);
  for (const nom of ['data.json', `photos/${references[0]}.jpg`, `photos/${references[1]}.jpg`]) {
    expect(archive, nom).toContain(nom);
  }
  expect(archive).not.toContain('_thumb');
});

test('isolation : un autre compte ne voit ni ne touche les bouteilles et photos', async ({ request }) => {
  const alice = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };
  const bob = { Authorization: `Bearer ${(await compteConnecte(request)).jeton}` };
  const bouteille = uuid();
  const [ajout] = await synchroniser(request, alice, [
    {
      client_ref: uuid(), schema_version: 1, kind: 'add', occurred_at: '2026-10-07T18:40:00.000Z',
      bottles: [{ client_ref: bouteille }],
      fields: { type: 'blanc', entry_date: '2026-10', origin: 'offerte' },
      location: { type: 'hors_rangement' },
    },
  ]);
  const id = ajout.bottles?.[0].id;
  await request.put(`/api/photos/${bouteille}`, { headers: { ...alice, 'Content-Type': 'image/jpeg' }, data: PHOTO });

  const [deplacement] = await synchroniser(request, bob, [
    {
      client_ref: uuid(), schema_version: 1, kind: 'move', occurred_at: '2026-10-07T19:00:00.000Z',
      bottle: bouteille, location: { type: 'hors_rangement' },
    },
  ]);
  expect(deplacement.error?.code).toBe('BOTTLE_NOT_FOUND');
  expect((await request.put(`/api/photos/${bouteille}`, { headers: { ...bob, 'Content-Type': 'image/jpeg' }, data: PHOTO })).status()).toBe(404);
  expect((await request.get(`/api/bottles/${id}/photo`, { headers: bob })).status()).toBe(404);
  expect((await request.delete(`/api/bottles/${id}/photo`, { headers: bob })).status()).toBe(404);
  expect((await request.get(`/api/bottles/${id}/photo`, { headers: alice })).status()).toBe(200);
  expect((await (await request.get('/api/export', { headers: bob })).body()).toString('latin1')).not.toContain('photos/');
});
