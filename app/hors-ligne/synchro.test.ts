import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientApi, ErreurReseau } from '../session/clientApi.ts';
import { erreur, jwt, reseauCoupe, simulerServeur } from '../test/serveur.ts';
import { serveurSync } from '../test/sync.ts';
import { BaseHorsLigne } from './base.ts';
import type { Mutation } from './mutations.ts';
import { ErreurCompte, Synchroniseur } from './synchro.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SYNC = 'POST /api/sync';
const QUAND = '2026-10-07T18:40:00.000Z';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ajout = (...bouteilles: string[]): Mutation => ({
  kind: 'add',
  occurred_at: QUAND,
  bottles: bouteilles.map((client_ref) => ({ client_ref })),
  fields: { type: 'rouge', entry_date: '2026-10', origin: 'achetee' },
  location: { type: 'hors_rangement' },
});
const deplacement = (bouteille: string): Mutation => ({
  kind: 'move',
  occurred_at: QUAND,
  bottle: bouteille,
  location: { type: 'carton', id: 4 },
});
const sortie = (bouteille: string): Mutation => ({
  kind: 'exit',
  occurred_at: QUAND,
  bottle: bouteille,
  exit_reason: 'consommee',
});

/** Base neuve d'un compte, client dont le jeton porte ce compte, serveur simulé. */
function preparer(routes: Parameters<typeof simulerServeur>[0] = {}, compteDuJeton?: string) {
  const compte = crypto.randomUUID();
  const serveur = simulerServeur({
    'POST /api/auth/refresh': Response.json({ access_token: jwt(compteDuJeton ?? compte), expires_in: 900 }),
    ...routes,
  });
  const base = new BaseHorsLigne(compte);
  const synchro = new Synchroniseur(new ClientApi(), base);
  return { serveur, base, synchro };
}

/** Met une mutation en file sans déclencher d'envoi. */
const enFile = (base: BaseHorsLigne, client_ref: string, mutation: unknown, schemaVersion = 1) =>
  base.file.add({ client_ref, schemaVersion, mutation });

const envoyees = async (requete: Request) =>
  ((await requete.clone().json()) as { mutations: { client_ref: string }[] }).mutations.map((m) => m.client_ref);

describe('Synchroniseur — file de mutations', () => {
  it('ajouter : met en file (client_ref UUID v4, version courante) puis envoie aussitôt', async () => {
    const sync = serveurSync();
    const { serveur, base, synchro } = preparer({ [SYNC]: sync.route });

    const ref = await synchro.ajouter(ajout('b1'));

    expect(ref).toMatch(UUID_V4);
    await vi.waitFor(() => expect(serveur.appels(SYNC)).toHaveLength(1));
    expect(await serveur.appels(SYNC)[0].json()).toEqual({
      mutations: [{ client_ref: ref, schema_version: 1, ...ajout('b1') }],
    });
    await vi.waitFor(async () => expect(await base.file.count()).toBe(0));
  });

  it('mutation appliquée : retirée de la file, correspondance client_ref → id et référence enregistrée', async () => {
    const sync = serveurSync();
    const { base, synchro } = preparer({ [SYNC]: sync.route });
    await enFile(base, 'm1', { ...ajout('b1', 'b2'), bottles: [{ client_ref: 'b1', reference: 'a7' }, { client_ref: 'b2' }] });

    expect(await synchro.synchroniser()).toEqual({ envoyees: 1, rejetees: 0, enAttente: 0, photos: 0 });

    expect(await base.file.count()).toBe(0);
    expect(await base.correspondances.toArray()).toEqual([
      { client_ref: 'b1', id: 1, reference: 'a7' },
      { client_ref: 'b2', id: 2, reference: 'g2' },
    ]);
  });

  it('ajouts envoyés avant les mouvements, ordre de la file conservé sinon', async () => {
    const sync = serveurSync();
    const { serveur, base, synchro } = preparer({ [SYNC]: sync.route });
    await enFile(base, 'm1', deplacement('b1'));
    await enFile(base, 'm2', ajout('b1'));
    await enFile(base, 'm3', sortie('b1'));
    await enFile(base, 'm4', ajout('b2'));

    await synchro.synchroniser();

    expect(await envoyees(serveur.appels(SYNC)[0])).toEqual(['m2', 'm4', 'm1', 'm3']);
    expect(await base.file.count()).toBe(0);
  });

  it('au plus 200 mutations par lot', async () => {
    const sync = serveurSync();
    const { serveur, base, synchro } = preparer({ [SYNC]: sync.route });
    await base.file.bulkAdd(Array.from({ length: 201 }, (_, i) => ({ client_ref: `m${i}`, schemaVersion: 1, mutation: ajout(`b${i}`) })));

    expect((await synchro.synchroniser()).envoyees).toBe(201);

    expect(await Promise.all(serveur.appels(SYNC).map(async (r) => (await envoyees(r)).length))).toEqual([200, 1]);
  });

  it('file vide, aucune photo : aucune requête', async () => {
    const { serveur, synchro } = preparer();

    expect(await synchro.synchroniser()).toEqual({ envoyees: 0, rejetees: 0, enAttente: 0, photos: 0 });
    expect(serveur.requetes).toHaveLength(0);
  });
});

describe('Synchroniseur — idempotence et reprise (Arch §4.2)', () => {
  it('réponse perdue après application : la mutation reste, son renvoi est reconnu, appliquée une seule fois', async () => {
    const sync = serveurSync();
    let coupure = true;
    const { serveur, base, synchro } = preparer({
      [SYNC]: async (requete) => {
        if (!coupure) return sync.route(requete);
        coupure = false;
        await sync.traiterLot(requete);
        return reseauCoupe();
      },
    });
    await enFile(base, 'm1', ajout('b1'));
    await enFile(base, 'm2', sortie('b1'));

    await expect(synchro.synchroniser()).rejects.toBeInstanceOf(ErreurReseau);
    expect(await base.file.count()).toBe(2);

    expect(await synchro.synchroniser()).toMatchObject({ envoyees: 2, enAttente: 0 });
    expect(serveur.appels(SYNC)).toHaveLength(2);
    expect([...sync.appliquees.keys()]).toEqual(['m1', 'm2']);
    expect(await base.correspondances.get('b1')).toEqual({ client_ref: 'b1', id: 1, reference: 'g1' });
  });

  it('même lot renvoyé (already_applied) : retiré de la file sans doublon côté serveur', async () => {
    const sync = serveurSync();
    const { base, synchro } = preparer({ [SYNC]: sync.route });
    await enFile(base, 'm1', ajout('b1'));
    await synchro.synchroniser();
    await enFile(base, 'm1', ajout('b1'));

    expect(await synchro.synchroniser()).toMatchObject({ envoyees: 1, enAttente: 0 });
    expect(sync.appliquees.size).toBe(1);
  });

  it('réseau coupé : file intacte ; au retour du réseau (événement online), envoyée une fois', async () => {
    const sync = serveurSync();
    let reseau = false;
    const { serveur, base, synchro } = preparer({ [SYNC]: (requete) => (reseau ? sync.route(requete) : reseauCoupe()) });
    await enFile(base, 'm1', ajout('b1'));
    const arreter = synchro.demarrer();
    await vi.waitFor(() => expect(serveur.appels(SYNC)).toHaveLength(1));
    expect(await base.file.count()).toBe(1);

    reseau = true;
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(async () => expect(await base.file.count()).toBe(0));
    expect(serveur.appels(SYNC)).toHaveLength(2);
    expect(sync.appliquees.size).toBe(1);

    arreter();
    await enFile(base, 'm2', sortie('b1'));
    window.dispatchEvent(new Event('online'));
    await new Promise((fin) => setTimeout(fin, 20));
    expect(serveur.appels(SYNC)).toHaveLength(2);
  });

  it('service indisponible (503) : file intacte, erreur relayée', async () => {
    const { base, synchro } = preparer({ [SYNC]: erreur(503, 'INTERNAL_ERROR', 'Erreur interne.') });
    await enFile(base, 'm1', ajout('b1'));

    await expect(synchro.synchroniser()).rejects.toMatchObject({ statut: 503 });
    expect(await base.file.count()).toBe(1);
  });

  it('synchronisations simultanées : un seul envoi ; un ajout pendant l’envoi part dans une passe suivante', async () => {
    const sync = serveurSync();
    let ouvrir!: () => void;
    const barriere = new Promise<void>((fin) => (ouvrir = fin));
    const { serveur, base, synchro } = preparer({
      [SYNC]: async (requete) => {
        await barriere;
        return sync.route(requete);
      },
    });
    await enFile(base, 'm1', ajout('b1'));

    const premiere = synchro.synchroniser();
    const seconde = synchro.synchroniser();
    await vi.waitFor(() => expect(serveur.appels(SYNC)).toHaveLength(1));
    const ref = await synchro.ajouter(sortie('b1'));
    ouvrir();

    expect(await premiere).toMatchObject({ envoyees: 2, enAttente: 0 });
    expect(await seconde).toMatchObject({ envoyees: 2, enAttente: 0 });
    expect(serveur.appels(SYNC)).toHaveLength(2);
    expect(await envoyees(serveur.appels(SYNC)[1])).toEqual([ref]);
  });

  it('verrou entre onglets : la passe s’exécute sous le verrou Web Locks de la base', async () => {
    const sync = serveurSync();
    const request = vi.fn((_nom: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const { base, synchro } = preparer({ [SYNC]: sync.route });
    await enFile(base, 'm1', ajout('b1'));

    await synchro.synchroniser();

    expect(request).toHaveBeenCalledWith(`${base.name}-synchro`, expect.any(Function));
    expect(await base.file.count()).toBe(0);
  });
});

describe('Synchroniseur — rejets (contrat §10.3)', () => {
  it.each([['BOTTLE_NOT_FOUND'], ['UNSUPPORTED_SCHEMA_VERSION']])('%s : la mutation est gardée', async (code) => {
    const { base, synchro } = preparer({
      [SYNC]: Response.json({ results: [{ client_ref: 'm1', status: 'rejected', error: { code, message: 'Refus.' } }] }),
    });
    await enFile(base, 'm1', deplacement('b9'));

    expect(await synchro.synchroniser()).toEqual({ envoyees: 0, rejetees: 0, enAttente: 1, photos: 0 });
    expect(await base.rejets.count()).toBe(0);
  });

  it('rejet définitif (BOTTLE_EXITED) : retirée de la file et consignée', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-09T10:00:00.000Z') });
    const { base, synchro } = preparer({
      [SYNC]: Response.json({
        results: [{ client_ref: 'm1', status: 'rejected', error: { code: 'BOTTLE_EXITED', message: 'Bouteille déjà sortie.' } }],
      }),
    });
    await enFile(base, 'm1', sortie('b1'));

    expect(await synchro.synchroniser()).toEqual({ envoyees: 0, rejetees: 1, enAttente: 0, photos: 0 });
    expect(await base.rejets.toArray()).toEqual([
      {
        id: 1,
        client_ref: 'm1',
        kind: 'exit',
        code: 'BOTTLE_EXITED',
        message: 'Bouteille déjà sortie.',
        rejeteLe: '2026-10-09T10:00:00.000Z',
      },
    ]);
    vi.useRealTimers();
  });

  it('ajout refusé : sa photo et les mouvements de ses bouteilles sont retirés et consignés', async () => {
    const { base, synchro } = preparer({
      [SYNC]: Response.json({
        results: [
          { client_ref: 'm1', status: 'rejected', error: { code: 'REFERENCE_TAKEN', message: 'Référence déjà prise.' } },
          { client_ref: 'm2', status: 'rejected', error: { code: 'BOTTLE_NOT_FOUND', message: 'Bouteille inconnue.' } },
        ],
      }),
    });
    await enFile(base, 'm1', ajout('b1', 'b2'));
    await enFile(base, 'm2', deplacement('b2'));
    await base.photos.bulkPut([
      { client_ref: 'm1', blob: new Blob(['x'], { type: 'image/jpeg' }) },
      { client_ref: 'b1', blob: new Blob(['y'], { type: 'image/jpeg' }) },
    ]);

    expect(await synchro.synchroniser()).toEqual({ envoyees: 0, rejetees: 2, enAttente: 0, photos: 0 });
    expect(await base.photos.count()).toBe(0);
    expect((await base.rejets.toArray()).map((r) => [r.client_ref, r.code])).toEqual([
      ['m1', 'REFERENCE_TAKEN'],
      ['m2', 'ADD_REJECTED'],
    ]);
  });

  it.each([
    ['plus récente que le code', 2],
    ['illisible', Number.NaN],
  ])('mutation de version %s : gardée, jamais envoyée', async (_cas, version) => {
    const { serveur, base, synchro } = preparer({ [SYNC]: serveurSync().route });
    await enFile(base, 'm1', { kind: 'futur' }, version);
    await enFile(base, 'm2', ajout('b1'));

    expect(await synchro.synchroniser()).toMatchObject({ envoyees: 1, enAttente: 1 });
    expect(await envoyees(serveur.appels(SYNC)[0])).toEqual(['m2']);
  });

  it('migre les mutations jusqu’à la version courante avant l’envoi, sans réécrire la file', async () => {
    const sync = serveurSync();
    const { serveur, base } = preparer({ [SYNC]: sync.route });
    const synchro = new Synchroniseur(new ClientApi(), base, {
      version: 2,
      migrations: { 1: (m) => ({ ...(m as object), fields: { type: 'blanc', entry_date: '2026-10', origin: 'achetee' } }) },
    });
    await enFile(base, 'm1', ajout('b1'));

    await synchro.synchroniser();

    expect(await serveur.appels(SYNC)[0].json()).toEqual({
      mutations: [
        { client_ref: 'm1', schema_version: 2, ...ajout('b1'), fields: { type: 'blanc', entry_date: '2026-10', origin: 'achetee' } },
      ],
    });
  });

  it('session d’un autre compte : rien n’est envoyé (ErreurCompte), file intacte', async () => {
    const { serveur, base, synchro } = preparer({ [SYNC]: serveurSync().route }, 'autre-compte');
    await enFile(base, 'm1', ajout('b1'));

    await expect(synchro.synchroniser()).rejects.toBeInstanceOf(ErreurCompte);
    expect(serveur.appels(SYNC)).toHaveLength(0);
    expect(await base.file.count()).toBe(1);
  });
});

describe('Synchroniseur — photos différées (Arch §5.1)', () => {
  const jpeg = (contenu: string) => new Blob([contenu], { type: 'image/jpeg' });

  it('après la file : chaque photo envoyée en image/jpeg puis retirée', async () => {
    const sync = serveurSync();
    const { serveur, base, synchro } = preparer({
      [SYNC]: sync.route,
      'PUT /api/photos/m1': new Response(null, { status: 204 }),
    });
    await enFile(base, 'm1', ajout('b1', 'b2'));
    await base.photos.put({ client_ref: 'm1', blob: jpeg('lot') });

    expect(await synchro.synchroniser()).toEqual({ envoyees: 1, rejetees: 0, enAttente: 0, photos: 1 });

    expect(serveur.requetes.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/auth/refresh',
      SYNC,
      'PUT /api/photos/m1',
    ]);
    const [envoi] = serveur.appels('PUT /api/photos/m1');
    expect(envoi.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await envoi.text()).toBe('lot');
    expect(await base.photos.count()).toBe(0);
  });

  it('ajouter avec photo : photo du lot enregistrée sous le client_ref de la mutation', async () => {
    const { base, synchro } = preparer({ [SYNC]: reseauCoupe });

    const ref = await synchro.ajouter(ajout('b1'), jpeg('lot'));

    expect((await base.photos.get(ref))?.blob.size).toBe(3);
  });

  it('ajouterPhoto : photo d’une bouteille, envoyée au prochain passage', async () => {
    const { serveur, base, synchro } = preparer({ 'PUT /api/photos/b1': new Response(null, { status: 204 }) });

    await synchro.ajouterPhoto('b1', jpeg('neuve'));

    await vi.waitFor(() => expect(serveur.appels('PUT /api/photos/b1')).toHaveLength(1));
    await vi.waitFor(async () => expect(await base.photos.count()).toBe(0));
  });

  it('404 (bouteille pas encore connue) : photo gardée pour une prochaine fois', async () => {
    const { base, synchro } = preparer({ 'PUT /api/photos/b1': erreur(404, 'NOT_FOUND', 'Introuvable.') });
    await base.photos.put({ client_ref: 'b1', blob: jpeg('x') });

    expect(await synchro.synchroniser()).toMatchObject({ photos: 0 });
    expect(await base.photos.count()).toBe(1);
  });

  it('photo dont l’ajout est encore en file : pas envoyée', async () => {
    const { serveur, base, synchro } = preparer({
      [SYNC]: Response.json({
        results: [{ client_ref: 'm1', status: 'rejected', error: { code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'Version.' } }],
      }),
    });
    await enFile(base, 'm1', ajout('b1'));
    await base.photos.bulkPut([
      { client_ref: 'm1', blob: jpeg('lot') },
      { client_ref: 'b1', blob: jpeg('une') },
    ]);

    await synchro.synchroniser();

    expect(serveur.requetes.some((r) => r.method === 'PUT')).toBe(false);
    expect(await base.photos.count()).toBe(2);
  });

  it.each([
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [400, 'VALIDATION_FAILED'],
  ])('refus définitif (%i %s) : photo retirée et consignée', async (statut, code) => {
    const { base, synchro } = preparer({ 'PUT /api/photos/b1': erreur(statut, code, 'Photo refusée.') });
    await base.photos.put({ client_ref: 'b1', blob: jpeg('x') });

    expect(await synchro.synchroniser()).toMatchObject({ rejetees: 1, photos: 0 });
    expect(await base.photos.count()).toBe(0);
    expect(await base.rejets.toArray()).toMatchObject([{ client_ref: 'b1', kind: 'photo', code }]);
  });

  it('réseau coupé pendant l’envoi : photo gardée, erreur relayée', async () => {
    const { base, synchro } = preparer({ 'PUT /api/photos/b1': reseauCoupe });
    await base.photos.put({ client_ref: 'b1', blob: jpeg('x') });

    await expect(synchro.synchroniser()).rejects.toBeInstanceOf(ErreurReseau);
    expect(await base.photos.count()).toBe(1);
  });
});
