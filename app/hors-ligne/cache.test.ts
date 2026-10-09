import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientApi, ErreurReseau } from '../session/clientApi.ts';
import { erreur, jwt, reseauCoupe, simulerServeur } from '../test/serveur.ts';
import { BaseHorsLigne } from './base.ts';
import { lireAvecCache } from './cache.ts';
import { ErreurCompte } from './synchro.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const CAVE = { cabinets: [], boxes: [], unplaced: 2 };

function preparer(reponse: Parameters<typeof simulerServeur>[0][string], compteDuJeton?: string) {
  const compte = crypto.randomUUID();
  simulerServeur({
    'POST /api/auth/refresh': Response.json({ access_token: jwt(compteDuJeton ?? compte), expires_in: 900 }),
    'GET /api/cellar': reponse,
  });
  return { base: new BaseHorsLigne(compte), client: new ClientApi() };
}

describe('lireAvecCache (Arch §4.2 : cache reconstructible, réseau d’abord)', () => {
  it('en ligne : réponse du serveur, copiée dans la base', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-09T10:00:00.000Z') });
    const { base, client } = preparer(Response.json(CAVE));

    expect(await lireAvecCache(client, base, '/api/cellar')).toEqual({
      donnees: CAVE,
      horsLigne: false,
      recueLe: '2026-10-09T10:00:00.000Z',
    });
    expect(await base.lectures.get('/api/cellar')).toEqual({
      route: '/api/cellar',
      corps: CAVE,
      recueLe: '2026-10-09T10:00:00.000Z',
    });
  });

  it.each([
    ['réseau coupé', reseauCoupe],
    ['serveur en erreur (5xx)', erreur(503, 'AUTH_SERVICE_UNAVAILABLE', 'Indisponible.')],
  ])('%s : dernière copie, marquée hors ligne avec sa date', async (_cas, reponse) => {
    const { base, client } = preparer(reponse);
    await base.lectures.put({ route: '/api/cellar', corps: CAVE, recueLe: '2026-10-08T07:00:00.000Z' });

    expect(await lireAvecCache(client, base, '/api/cellar')).toEqual({
      donnees: CAVE,
      horsLigne: true,
      recueLe: '2026-10-08T07:00:00.000Z',
    });
  });

  it('injoignable sans copie : erreur relayée', async () => {
    const { base, client } = preparer(reseauCoupe);

    await expect(lireAvecCache(client, base, '/api/cellar')).rejects.toBeInstanceOf(ErreurReseau);
  });

  it('refus du serveur (4xx) : erreur relayée même avec une copie', async () => {
    const { base, client } = preparer(erreur(404, 'NOT_FOUND', 'Introuvable.'));
    await base.lectures.put({ route: '/api/cellar', corps: CAVE, recueLe: '2026-10-08T07:00:00.000Z' });

    await expect(lireAvecCache(client, base, '/api/cellar')).rejects.toMatchObject({ statut: 404 });
  });

  it('session d’un autre compte : rien n’est copié (ErreurCompte)', async () => {
    const { base, client } = preparer(Response.json(CAVE), 'autre-compte');

    await expect(lireAvecCache(client, base, '/api/cellar')).rejects.toBeInstanceOf(ErreurCompte);
    expect(await base.lectures.count()).toBe(0);
  });
});

describe('BaseHorsLigne', () => {
  it('une base par compte : les données d’un compte n’apparaissent pas dans l’autre', async () => {
    const a = new BaseHorsLigne(`a-${crypto.randomUUID()}`);
    const b = new BaseHorsLigne(`b-${crypto.randomUUID()}`);

    await a.file.add({ client_ref: 'm1', schemaVersion: 1, mutation: {} });

    expect(a.name).toBe(`invintory-${a.compte}`);
    expect(a.name).not.toBe(b.name);
    expect(await b.file.count()).toBe(0);
  });

  it('file : clé d’ordre croissante, client_ref unique', async () => {
    const base = new BaseHorsLigne(crypto.randomUUID());

    await base.file.add({ client_ref: 'm2', schemaVersion: 1, mutation: {} });
    await base.file.add({ client_ref: 'm1', schemaVersion: 1, mutation: {} });

    expect((await base.file.orderBy('ordre').toArray()).map((e) => e.client_ref)).toEqual(['m2', 'm1']);
    await expect(base.file.add({ client_ref: 'm1', schemaVersion: 1, mutation: {} })).rejects.toMatchObject({
      name: 'ConstraintError',
    });
  });
});
