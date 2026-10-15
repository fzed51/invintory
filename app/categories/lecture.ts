import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import { cleFile } from '../cave/lecture.ts';
import { useEnAttente } from '../cave/attente.ts';
import { lireAvecCache } from '../hors-ligne/cache.ts';
import { useHorsLigne } from '../hors-ligne/contexte.ts';
import { useSession } from '../session/contexte.ts';
import type { Categorie, Manque } from './categories.ts';

export type Lecture<T> = { etat: 'chargement' } | { etat: 'erreur'; erreur: unknown } | { etat: 'pret'; donnees: T; horsLigne: boolean };

/**
 * Route lue « réseau d'abord » avec repli sur la copie locale (contrat §2 : catégories et
 * manques consultables hors ligne). Relue quand `declencheur` change, sans effacer l'affichage ;
 * pas de lecture tant qu'il vaut null.
 */
function useLecture<T>(route: string, declencheur: string | number | null): Lecture<T> {
  const { client } = useSession();
  const horsLigne = useHorsLigne();
  const [lecture, setLecture] = useState<Lecture<T>>({ etat: 'chargement' });

  useEffect(() => {
    if (declencheur === null) return;
    let actif = true;
    const lue = horsLigne
      ? lireAvecCache<T>(client, horsLigne.base, route)
      : client.requete<T>(route).then((donnees) => ({ donnees, horsLigne: false }));
    lue.then(
      ({ donnees, horsLigne: copie }) => {
        if (actif) setLecture({ etat: 'pret', donnees, horsLigne: copie });
      },
      (erreur: unknown) => {
        if (actif) setLecture({ etat: 'erreur', erreur });
      },
    );
    return () => {
      actif = false;
    };
  }, [client, horsLigne, route, declencheur]);

  return lecture;
}

/**
 * Catégories en manque, calculées par le serveur (contrat §9). Relues à chaque changement
 * d'écran (`ecran`) et de la file : une sortie envoyée peut faire passer une catégorie sous
 * son seuil. Les mouvements encore en attente n'y sont pas comptés.
 */
export function useManques(ecran: string): Lecture<Manque[]> {
  // La file d'abord, comme la cave : une lecture sans elle serait aussitôt refaite.
  const file = cleFile(useEnAttente(useHorsLigne()?.base ?? null));
  const lecture = useLecture<{ shortages: Manque[] }>('/api/shortages', file === null ? null : `${ecran}|${file}`);
  return lecture.etat === 'pret' ? { ...lecture, donnees: lecture.donnees.shortages } : lecture;
}

/** Manques lus par la coque pour la pastille, repris par l'écran Manques (une seule lecture). */
export function useManquesDeLaCoque(): Lecture<Manque[]> {
  return useOutletContext<Lecture<Manque[]>>();
}

/** Catégories du compte ; `version` change pour relire après une écriture. */
export function useCategories(version = 0): Lecture<Categorie[]> {
  const lecture = useLecture<{ categories: Categorie[] }>('/api/categories', version);
  return lecture.etat === 'pret' ? { ...lecture, donnees: lecture.donnees.categories } : lecture;
}
