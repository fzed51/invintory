import { useEffect, useState } from 'react';
import { lireAvecCache, type Lu } from '../hors-ligne/cache.ts';
import { useHorsLigne } from '../hors-ligne/contexte.ts';
import type { ClientApi } from '../session/clientApi.ts';
import { useSession } from '../session/contexte.ts';
import type { Bouteille, Cave, Emplacement, Etagere } from './types.ts';

export type CaveLue = { cave: Cave; bouteilles: Bouteille[]; horsLigne: boolean };
export type LectureCave = { etat: 'chargement' } | { etat: 'erreur'; erreur: unknown } | ({ etat: 'pret' } & CaveLue);

/** Lecture sans base locale (jeton sans compte) : réseau seul. */
async function lireSansCache<T>(client: ClientApi, route: string): Promise<Lu<T>> {
  return { donnees: await client.requete<T>(route), horsLigne: false, recueLe: new Date().toISOString() };
}

/**
 * Emplacements (`/api/cellar`) et bouteilles en cave (`/api/bottles`), lus « réseau
 * d'abord » avec repli sur la copie locale (P37). `recharger` relit sans effacer l'affichage.
 */
export function useCave(): LectureCave & { recharger: () => void } {
  const { client } = useSession();
  const horsLigne = useHorsLigne();
  const [lecture, setLecture] = useState<LectureCave>({ etat: 'chargement' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    const lire = <T>(route: string) =>
      horsLigne ? lireAvecCache<T>(client, horsLigne.base, route) : lireSansCache<T>(client, route);
    Promise.all([lire<Cave>('/api/cellar'), lire<{ bottles: Bouteille[] }>('/api/bottles')]).then(
      ([cave, bouteilles]) => {
        if (!actif) return;
        setLecture({
          etat: 'pret',
          cave: cave.donnees,
          bouteilles: bouteilles.donnees.bottles,
          horsLigne: cave.horsLigne || bouteilles.horsLigne,
        });
      },
      (erreur: unknown) => {
        if (actif) setLecture({ etat: 'erreur', erreur });
      },
    );
    return () => {
      actif = false;
    };
  }, [client, horsLigne, version]);

  return { ...lecture, recharger: () => setVersion((v) => v + 1) };
}

/** « Étagère N » d'après sa position quand elle n'a pas de nom (P31, contrat §1.5). */
export function nomEtagere(etagere: Etagere): string {
  return etagere.name ?? `Étagère ${etagere.position}`;
}

export function libelleEmplacement(emplacement: Emplacement): string {
  return emplacement.type === 'hors_rangement' ? 'Hors rangement' : emplacement.label;
}

export function rangeesSur(bouteilles: Bouteille[], etagere: number): Bouteille[] {
  return bouteilles.filter((b) => b.location.type === 'etagere' && b.location.id === etagere);
}

export function rangeesDans(bouteilles: Bouteille[], carton: number): Bouteille[] {
  return bouteilles.filter((b) => b.location.type === 'carton' && b.location.id === carton);
}

export function horsRangement(bouteilles: Bouteille[]): Bouteille[] {
  return bouteilles.filter((b) => b.location.type === 'hors_rangement');
}
