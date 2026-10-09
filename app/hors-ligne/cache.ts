import { ErreurApi, ErreurReseau, type ClientApi } from '../session/clientApi.ts';
import type { BaseHorsLigne } from './base.ts';
import { ErreurCompte } from './synchro.ts';

export type Lu<T> = {
  donnees: T;
  /** true : copie locale, le serveur étant injoignable. */
  horsLigne: boolean;
  /** Date de réception de ces données (ISO 8601). */
  recueLe: string;
};

/** Serveur hors d'atteinte : réseau coupé ou erreur 5xx (même règle qu'au démarrage, P35). */
function injoignable(erreur: unknown): boolean {
  return erreur instanceof ErreurReseau || (erreur instanceof ErreurApi && erreur.statut >= 500);
}

/**
 * Lecture « réseau d'abord » : la réponse du serveur remplace la copie locale de la route ;
 * serveur injoignable, la dernière copie est rendue. Pas de copie, ou refus du serveur : erreur.
 */
export async function lireAvecCache<T>(client: ClientApi, base: BaseHorsLigne, route: string): Promise<Lu<T>> {
  let donnees: T;
  try {
    donnees = await client.requete<T>(route);
  } catch (erreur) {
    if (!injoignable(erreur)) throw erreur;
    const copie = await base.lectures.get(route);
    if (copie === undefined) throw erreur;
    return { donnees: copie.corps as T, horsLigne: true, recueLe: copie.recueLe };
  }
  if (client.compte() !== base.compte) throw new ErreurCompte();
  const recueLe = new Date().toISOString();
  await base.lectures.put({ route, corps: donnees, recueLe });
  return { donnees, horsLigne: false, recueLe };
}
