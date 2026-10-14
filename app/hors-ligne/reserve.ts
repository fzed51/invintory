import type { ClientApi } from '../session/clientApi.ts';
import type { BaseHorsLigne } from './base.ts';
import { ErreurCompte } from './synchro.ts';

/**
 * Réserve de références de l'appareil (P1, contrat §4) : `taille` codes demandés d'avance,
 * complétée dès qu'elle passe sous `seuil` et que le réseau est là.
 */
export const RESERVE = { taille: 30, seuil: 10 } as const;

/** Contrat §4 : 1 à 100 codes par demande. */
const PAR_DEMANDE = 100;

/**
 * Complète la réserve jusqu'à sa taille, ou jusqu'à `besoin` codes (ajout en masse) s'il est
 * plus grand ; rien si elle contient déjà de quoi faire. Lève l'erreur du serveur (hors ligne).
 */
export async function completerReserve(client: ClientApi, base: BaseHorsLigne, besoin = 0): Promise<void> {
  const presents = await base.reserve.count();
  if (presents >= Math.max(RESERVE.seuil, besoin)) return;
  const nombre = Math.min(PAR_DEMANDE, Math.max(RESERVE.taille, besoin) - presents);
  if ((await client.compteConnecte()) !== base.compte) throw new ErreurCompte();
  const { references } = await client.requete<{ references: string[] }>('/api/references/reservations', {
    methode: 'POST',
    corps: { count: nombre },
  });
  await base.reserve.bulkAdd(references.map((reference) => ({ reference })));
}

/**
 * Retire les `nombre` premiers codes de la réserve, dans l'ordre ; null pour chaque bouteille
 * au-delà de la réserve (le serveur lui en attribuera un à la synchronisation).
 */
export async function prendreReferences(base: BaseHorsLigne, nombre: number): Promise<(string | null)[]> {
  return base.transaction('rw', base.reserve, async () => {
    const codes = await base.reserve.orderBy('ordre').limit(nombre).toArray();
    await base.reserve.bulkDelete(codes.map((code) => code.ordre!));
    return Array.from({ length: nombre }, (_, i) => codes[i]?.reference ?? null);
  });
}
