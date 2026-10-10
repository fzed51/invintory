import { liveQuery } from 'dexie';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BaseHorsLigne, Rejet } from './base.ts';
import type { EntreeFile } from './mutations.ts';

export type EtatFile = {
  /** Mouvements en attente : une bouteille d'un ajout compte pour un mouvement d'entrée. */
  mouvements: number;
  photos: number;
  rejets: Rejet[];
};

function mouvements(entree: EntreeFile): number {
  const { bottles } = (entree.mutation ?? {}) as { bottles?: unknown };
  return Array.isArray(bottles) ? bottles.length : 1;
}

/** Contenu de la file, des photos et des rejets du compte, tenu à jour à chaque écriture. */
export function useEtatFile(base: BaseHorsLigne | null): EtatFile | null {
  const [etat, setEtat] = useState<EtatFile | null>(null);

  useEffect(() => {
    if (base === null) return;
    const abonnement = liveQuery(async () => ({
      mouvements: (await base.file.toArray()).reduce((total, entree) => total + mouvements(entree), 0),
      photos: await base.photos.count(),
      rejets: await base.rejets.toArray(),
    })).subscribe({ next: setEtat });
    return () => abonnement.unsubscribe();
  }, [base]);

  return base === null ? null : etat;
}

function suivreReseau(changement: () => void): () => void {
  window.addEventListener('online', changement);
  window.addEventListener('offline', changement);
  return () => {
    window.removeEventListener('online', changement);
    window.removeEventListener('offline', changement);
  };
}

/** État du réseau selon le navigateur (`navigator.onLine`). */
export function useEnLigne(): boolean {
  return useSyncExternalStore(suivreReseau, () => navigator.onLine);
}
