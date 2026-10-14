import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseHorsLigne } from '../hors-ligne/base.ts';
import { migrer } from '../hors-ligne/mutations.ts';
import type { Synchroniseur } from '../hors-ligne/synchro.ts';
import { effacerBrouillon, ecrireBrouillon, enregistrerAjout, lireBrouillon, saisieInitiale, type SaisieAjout } from './ajout.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QUAND = new Date('2026-10-14T09:30:00.000Z');

/** Base neuve et synchroniseur simulé : seuls ses déclencheurs sont observés. */
function preparer() {
  const base = new BaseHorsLigne(crypto.randomUUID());
  const synchro = { relancer: vi.fn(), reserver: vi.fn(async () => undefined) };
  return { base, synchro, horsLigne: { base, synchro: synchro as unknown as Synchroniseur } };
}

const saisie = (champs: Partial<SaisieAjout> = {}): SaisieAjout => ({ ...saisieInitiale(QUAND), ...champs });

describe('saisieInitiale', () => {
  it('formulaire vide : une bouteille rouge achetée, entrée le mois courant de l’appareil', () => {
    expect(saisieInitiale(new Date(2026, 9, 14))).toEqual({
      type: 'rouge',
      domaine: '',
      region: '',
      cepage: '',
      millesime: '',
      dateEntree: '2026-10',
      origine: 'achetee',
      souvenir: false,
      note: '',
      quantite: '1',
      photo: null,
    });
    expect(saisieInitiale(new Date(2027, 0, 3)).dateEntree).toBe('2027-01');
  });
});

describe('Brouillon de saisie (P4, issue #21)', () => {
  it('écrit, relit (photo comprise), puis efface la saisie', async () => {
    const { base } = preparer();
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

    expect(await lireBrouillon(base)).toBeNull();
    await ecrireBrouillon(base, saisie({ domaine: 'Château Exemple', quantite: '6', photo }));
    const relu = await lireBrouillon(base);
    expect(relu).toMatchObject({ domaine: 'Château Exemple', quantite: '6' });
    expect(await relu?.photo?.text()).toBe('jpeg');

    await ecrireBrouillon(base, saisie({ domaine: 'Autre' }));
    expect((await lireBrouillon(base))?.domaine).toBe('Autre');

    await effacerBrouillon(base);
    expect(await lireBrouillon(base)).toBeNull();
  });

  it('brouillon d’une forme inconnue (version future ou abîmée) : ignoré', async () => {
    const { base } = preparer();
    await base.brouillons.put({ cle: 'ajout', saisie: { version: 99 } });

    expect(await lireBrouillon(base)).toBeNull();
  });
});

describe('enregistrerAjout (CdC §3.3, contrat §10.1)', () => {
  it('met en file un ajout de N bouteilles, chacune avec son client_ref et un code de la réserve', async () => {
    const { base, horsLigne } = preparer();
    await base.reserve.bulkAdd([{ reference: 'a2' }, { reference: 'a3' }, { reference: 'a4' }, { reference: 'a5' }]);

    const ajout = await enregistrerAjout(
      horsLigne,
      saisie({ quantite: '3', domaine: 'Château Exemple', region: 'Bordeaux', millesime: '2018', note: 'Pour Noël' }),
      { type: 'etagere', id: 12 },
      QUAND,
    );

    expect(ajout.references).toEqual(['a2', 'a3', 'a4']);
    const [entree] = await base.file.toArray();
    expect(entree.client_ref).toBe(ajout.client_ref);
    expect(entree.client_ref).toMatch(UUID_V4);
    expect(entree.schemaVersion).toBe(1);
    const mutation = migrer(entree);
    expect(mutation).toEqual({
      kind: 'add',
      occurred_at: QUAND.toISOString(),
      bottles: [
        { client_ref: expect.stringMatching(UUID_V4), reference: 'a2' },
        { client_ref: expect.stringMatching(UUID_V4), reference: 'a3' },
        { client_ref: expect.stringMatching(UUID_V4), reference: 'a4' },
      ],
      fields: {
        type: 'rouge',
        region: 'Bordeaux',
        grape: null,
        domain: 'Château Exemple',
        vintage: 2018,
        entry_date: '2026-10',
        origin: 'achetee',
        note: 'Pour Noël',
        souvenir: false,
      },
      location: { type: 'etagere', id: 12 },
    });
    const refs = mutation?.kind === 'add' ? mutation.bottles.map((b) => b.client_ref) : [];
    expect(new Set(refs).size).toBe(3);
    expect((await base.reserve.toArray()).map((r) => r.reference)).toEqual(['a5']);
  });

  it('réserve trop courte : les bouteilles sans code partent sans référence (attribuée par le serveur)', async () => {
    const { base, horsLigne } = preparer();
    await base.reserve.add({ reference: 'a2' });

    const ajout = await enregistrerAjout(horsLigne, saisie({ quantite: '2' }), { type: 'hors_rangement' }, QUAND);

    expect(ajout.references).toEqual(['a2', null]);
    const mutation = migrer((await base.file.toArray())[0]);
    expect(mutation?.kind === 'add' && mutation.bottles.map((b) => b.reference)).toEqual(['a2', undefined]);
  });

  it('photo du lot gardée sous le client_ref de l’ajout (copiée par bouteille par le serveur, Arch §5.3)', async () => {
    const { base, horsLigne } = preparer();
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

    const ajout = await enregistrerAjout(horsLigne, saisie({ quantite: '6', photo }), { type: 'carton', id: 4 }, QUAND);

    const photos = await base.photos.toArray();
    expect(photos.map((p) => p.client_ref)).toEqual([ajout.client_ref]);
    expect(await photos[0].blob.text()).toBe('jpeg');
  });

  it('sans photo : aucune photo en attente', async () => {
    const { base, horsLigne } = preparer();

    await enregistrerAjout(horsLigne, saisie(), { type: 'hors_rangement' }, QUAND);

    expect(await base.photos.count()).toBe(0);
  });

  it('efface le brouillon avec la mise en file, puis lance l’envoi et complète la réserve', async () => {
    const { base, synchro, horsLigne } = preparer();
    await ecrireBrouillon(base, saisie({ domaine: 'En cours' }));

    await enregistrerAjout(horsLigne, saisie({ quantite: '4' }), { type: 'hors_rangement' }, QUAND);

    expect(await lireBrouillon(base)).toBeNull();
    expect(synchro.relancer).toHaveBeenCalledOnce();
    expect(synchro.reserver).toHaveBeenCalled();
  });

  it('champs vides : null ; millésime en nombre ; souvenir et origine transmis', async () => {
    const { base, horsLigne } = preparer();

    await enregistrerAjout(
      horsLigne,
      saisie({ type: 'effervescent', origine: 'offerte', souvenir: true, dateEntree: '2025-03' }),
      { type: 'hors_rangement' },
      QUAND,
    );

    const mutation = migrer((await base.file.toArray())[0]);
    expect(mutation?.kind === 'add' && mutation.fields).toEqual({
      type: 'effervescent',
      region: null,
      grape: null,
      domain: null,
      vintage: null,
      entry_date: '2025-03',
      origin: 'offerte',
      note: null,
      souvenir: true,
    });
  });
});
