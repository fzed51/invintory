import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientApi } from '../session/clientApi.ts';
import { erreur, jwt, reseauCoupe, simulerServeur } from '../test/serveur.ts';
import { BaseHorsLigne } from './base.ts';
import { completerReserve, prendreReferences, RESERVE } from './reserve.ts';
import { ErreurCompte, Synchroniseur } from './synchro.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const RESERVER = 'POST /api/references/reservations';

/** Codes renvoyés par le serveur simulé, à la suite d'un appel à l'autre. */
function serveurReserve() {
  let suivant = 0;
  return async (requete: Request) => {
    const { count } = (await requete.clone().json()) as { count: number };
    return Response.json({ references: Array.from({ length: count }, () => `r${++suivant}`) }, { status: 201 });
  };
}

function preparer(routes: Parameters<typeof simulerServeur>[0] = {}, compteDuJeton?: string) {
  const compte = crypto.randomUUID();
  const serveur = simulerServeur({
    'POST /api/auth/refresh': Response.json({ access_token: jwt(compteDuJeton ?? compte), expires_in: 900 }),
    ...routes,
  });
  const base = new BaseHorsLigne(compte);
  const client = new ClientApi();
  return { serveur, base, client };
}

const contenu = async (base: BaseHorsLigne) => (await base.reserve.orderBy('ordre').toArray()).map((r) => r.reference);
const demandes = async (serveur: ReturnType<typeof simulerServeur>) =>
  Promise.all(serveur.appels(RESERVER).map(async (r) => ((await r.clone().json()) as { count: number }).count));

describe('Réserve de références (P1, contrat §4)', () => {
  it('réserve vide : demande la taille de la réserve et garde les codes dans l’ordre reçu', async () => {
    const { serveur, base, client } = preparer({ [RESERVER]: serveurReserve() });

    await completerReserve(client, base);

    expect(await demandes(serveur)).toEqual([RESERVE.taille]);
    expect(await contenu(base)).toEqual(Array.from({ length: RESERVE.taille }, (_, i) => `r${i + 1}`));
  });

  it('au-dessus du seuil : aucune demande', async () => {
    const { serveur, base, client } = preparer({ [RESERVER]: serveurReserve() });
    await base.reserve.bulkAdd(Array.from({ length: RESERVE.seuil }, (_, i) => ({ reference: `x${i}` })));

    await completerReserve(client, base);

    expect(serveur.appels(RESERVER)).toHaveLength(0);
  });

  it('sous le seuil : complète jusqu’à la taille de la réserve', async () => {
    const { serveur, base, client } = preparer({ [RESERVER]: serveurReserve() });
    await base.reserve.bulkAdd([{ reference: 'x1' }, { reference: 'x2' }]);

    await completerReserve(client, base);

    expect(await demandes(serveur)).toEqual([RESERVE.taille - 2]);
    expect((await contenu(base)).slice(0, 3)).toEqual(['x1', 'x2', 'r1']);
  });

  it('besoin d’un ajout en masse au-delà de la taille : complète jusqu’au besoin, 100 codes au plus par demande', async () => {
    const { serveur, base, client } = preparer({ [RESERVER]: serveurReserve() });
    await base.reserve.bulkAdd(Array.from({ length: 20 }, (_, i) => ({ reference: `x${i}` })));

    await completerReserve(client, base, 60);
    await completerReserve(client, base, 300);

    expect(await demandes(serveur)).toEqual([40, 100]);
    expect(await base.reserve.count()).toBe(160);
  });

  it('session d’un autre compte : rien n’est demandé ni gardé', async () => {
    const { serveur, base, client } = preparer({ [RESERVER]: serveurReserve() }, 'autre-compte');

    await expect(completerReserve(client, base)).rejects.toBeInstanceOf(ErreurCompte);

    expect(serveur.appels(RESERVER)).toHaveLength(0);
    expect(await base.reserve.count()).toBe(0);
  });

  it('serveur injoignable ou refus : l’erreur remonte, la réserve est inchangée', async () => {
    const coupe = preparer({ [RESERVER]: reseauCoupe() });
    await expect(completerReserve(coupe.client, coupe.base)).rejects.toThrow();
    expect(await coupe.base.reserve.count()).toBe(0);

    const refuse = preparer({ [RESERVER]: erreur(400, 'VALIDATION_FAILED') });
    await expect(completerReserve(refuse.client, refuse.base)).rejects.toThrow();
    expect(await refuse.base.reserve.count()).toBe(0);
  });

  it('prendreReferences : retire et rend les premiers codes, dans l’ordre', async () => {
    const { base } = preparer();
    await base.reserve.bulkAdd([{ reference: 'a2' }, { reference: 'a3' }, { reference: 'a4' }]);

    expect(await prendreReferences(base, 2)).toEqual(['a2', 'a3']);
    expect(await contenu(base)).toEqual(['a4']);
  });

  it('prendreReferences : réserve trop courte, les bouteilles restantes n’ont pas de code (attribué par le serveur)', async () => {
    const { base } = preparer();
    await base.reserve.add({ reference: 'a2' });

    expect(await prendreReferences(base, 3)).toEqual(['a2', null, null]);
    expect(await base.reserve.count()).toBe(0);
  });
});

describe('Synchroniseur — réserve', () => {
  it('demarrer : complète la réserve, puis à nouveau au retour du réseau', async () => {
    const { serveur, base, client } = preparer({ [RESERVER]: serveurReserve() });
    const synchro = new Synchroniseur(client, base);

    const arreter = synchro.demarrer();
    await vi.waitFor(async () => expect(await base.reserve.count()).toBe(RESERVE.taille));
    await base.reserve.clear();
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => expect(await base.reserve.count()).toBe(RESERVE.taille));
    arreter();

    expect(serveur.appels(RESERVER)).toHaveLength(2);
  });

  it('reserver : une seule demande à la fois dans l’onglet', async () => {
    const { serveur, base, client } = preparer({ [RESERVER]: serveurReserve() });
    const synchro = new Synchroniseur(client, base);

    await Promise.all([synchro.reserver(), synchro.reserver()]);

    expect(serveur.appels(RESERVER)).toHaveLength(1);
    expect(await base.reserve.count()).toBe(RESERVE.taille);
  });
});
