import { useEffect, useMemo, type ReactNode } from 'react';
import { useSession } from '../session/contexte.ts';
import { BaseHorsLigne } from './base.ts';
import { ContexteHorsLigne } from './contexte.ts';
import { Synchroniseur } from './synchro.ts';

/** Ouvre la base locale du compte et synchronise sa file tant que l'application est montée. */
export function HorsLigneProvider({ compte, children }: { compte: string; children: ReactNode }) {
  const { client } = useSession();
  const horsLigne = useMemo(() => {
    const base = new BaseHorsLigne(compte);
    return { base, synchro: new Synchroniseur(client, base) };
  }, [client, compte]);

  useEffect(() => {
    const arreter = horsLigne.synchro.demarrer();
    return () => {
      arreter();
      // Réouverture automatique si le même fournisseur redémarre (StrictMode).
      horsLigne.base.close({ disableAutoOpen: false });
    };
  }, [horsLigne]);

  return <ContexteHorsLigne value={horsLigne}>{children}</ContexteHorsLigne>;
}
