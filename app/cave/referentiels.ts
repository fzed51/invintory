import { useEffect, useState } from 'react';
import type { BaseHorsLigne } from '../hors-ligne/base.ts';
import { lireAvecCache } from '../hors-ligne/cache.ts';
import { useHorsLigne } from '../hors-ligne/contexte.ts';
import type { ClientApi } from '../session/clientApi.ts';
import { useSession } from '../session/contexte.ts';

type Nom = 'regions' | 'grapes';

/**
 * Noms connus d'un référentiel (contrat §6), pour l'autocomplétion : lus « réseau d'abord »
 * avec repli sur la copie locale (ajout hors ligne) ; liste vide si rien n'est lisible.
 */
export async function lireReferentiel(client: ClientApi, base: BaseHorsLigne | null, nom: Nom): Promise<string[]> {
  const route = `/api/${nom}`;
  try {
    const reponse =
      base === null
        ? await client.requete<Record<Nom, { name: string }[]>>(route)
        : (await lireAvecCache<Record<Nom, { name: string }[]>>(client, base, route)).donnees;
    return (reponse[nom] ?? []).map((element) => element.name);
  } catch {
    return [];
  }
}

/** Noms connus d'un référentiel, lus une fois à l'ouverture de l'écran. */
export function useReferentiel(nom: Nom): string[] {
  const { client } = useSession();
  const base = useHorsLigne()?.base ?? null;
  const [noms, setNoms] = useState<string[]>([]);
  useEffect(() => {
    let actif = true;
    void lireReferentiel(client, base, nom).then((lus) => {
      if (actif) setNoms(lus);
    });
    return () => {
      actif = false;
    };
  }, [client, base, nom]);
  return noms;
}
