import { createContext, useContext } from 'react';
import type { BaseHorsLigne } from './base.ts';
import type { Synchroniseur } from './synchro.ts';

export type HorsLigne = { base: BaseHorsLigne; synchro: Synchroniseur };

export const ContexteHorsLigne = createContext<HorsLigne | null>(null);

/** Base locale et synchronisation du compte ; null si aucun compte n'est connu. */
export function useHorsLigne(): HorsLigne | null {
  return useContext(ContexteHorsLigne);
}
