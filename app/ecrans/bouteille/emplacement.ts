import type { Emplacement } from '../../cave/types.ts';
import type { Emplacement as Cible } from '../../hors-ligne/mutations.ts';

// Emplacement de rangement, partagé par Déplacer et l'ajout de bouteilles.

export const HORS_RANGEMENT: Emplacement = { type: 'hors_rangement' };

export const placesLibres = (n: number) => `${n} ${n > 1 ? 'places libres' : 'place libre'}`;

/** Cible d'une mutation : `type` et `id` seulement (contrat §1.5). */
export function cible(emplacement: Emplacement): Cible {
  return emplacement.type === 'hors_rangement' ? { type: 'hors_rangement' } : { type: emplacement.type, id: emplacement.id };
}
