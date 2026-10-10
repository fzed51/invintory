import { useEffect, useState } from 'react';
import type { BaseHorsLigne } from '../hors-ligne/base.ts';
import { injoignable, lireAvecCache } from '../hors-ligne/cache.ts';
import { useHorsLigne } from '../hors-ligne/contexte.ts';
import { ErreurApi, type ClientApi } from '../session/clientApi.ts';
import { useSession } from '../session/contexte.ts';
import { normaliserReference } from './format.ts';
import type { Bouteille, Fiche, Mouvement } from './types.ts';

/** `mouvements` vaut null quand seule la copie de la liste est disponible (hors ligne). */
export type FicheLue = { bouteille: Bouteille; mouvements: Mouvement[] | null; horsLigne: boolean };

/** Bouteilles en cave de la copie locale de `/api/bottles` (lue par la vue cave). */
async function copieDeLaListe(base: BaseHorsLigne): Promise<Bouteille[]> {
  const copie = await base.lectures.get('/api/bottles');
  return (copie?.corps as { bottles: Bouteille[] } | undefined)?.bottles ?? [];
}

/**
 * Fiche « réseau d'abord » (copie de la fiche si elle a déjà été ouverte). Serveur
 * injoignable sans copie : la bouteille est reprise de la copie de la liste, sans historique.
 */
export async function lireFiche(client: ClientApi, base: BaseHorsLigne | null, id: number): Promise<FicheLue> {
  const route = `/api/bottles/${id}`;
  try {
    if (base === null) {
      const { movements, ...bouteille } = await client.requete<Fiche>(route);
      return { bouteille, mouvements: movements, horsLigne: false };
    }
    const lue = await lireAvecCache<Fiche>(client, base, route);
    const { movements, ...bouteille } = lue.donnees;
    return { bouteille, mouvements: movements, horsLigne: lue.horsLigne };
  } catch (erreur) {
    if (base === null || !injoignable(erreur)) throw erreur;
    const bouteille = (await copieDeLaListe(base)).find((b) => b.id === id);
    if (bouteille === undefined) throw erreur;
    return { bouteille, mouvements: null, horsLigne: true };
  }
}

export type Recherche = { id: number | null; horsLigne: boolean };

/**
 * Recherche par référence (CdC §2.3) : sur le serveur, ou dans la copie locale des
 * bouteilles en cave quand il est injoignable. `id` null : aucune bouteille trouvée.
 */
export async function chercherReference(
  client: ClientApi,
  base: BaseHorsLigne | null,
  saisie: string,
): Promise<Recherche> {
  const reference = normaliserReference(saisie);
  try {
    const fiche = await client.requete<Fiche>(`/api/bottles/by-reference/${encodeURIComponent(reference)}`);
    return { id: fiche.id, horsLigne: false };
  } catch (erreur) {
    if (erreur instanceof ErreurApi && erreur.code === 'NOT_FOUND') return { id: null, horsLigne: false };
    if (base === null || !injoignable(erreur)) throw erreur;
    const trouvee = (await copieDeLaListe(base)).find((b) => b.reference.toLowerCase() === reference);
    return { id: trouvee?.id ?? null, horsLigne: true };
  }
}

export type LectureFiche = { etat: 'chargement' } | { etat: 'erreur'; erreur: unknown } | ({ etat: 'pret' } & FicheLue);

/** Fiche de la bouteille `id`, relue à chaque changement d'adresse. */
export function useFiche(id: number): LectureFiche {
  const { client } = useSession();
  const horsLigne = useHorsLigne();
  const [lecture, setLecture] = useState<LectureFiche & { id?: number }>({ etat: 'chargement' });

  useEffect(() => {
    let actif = true;
    lireFiche(client, horsLigne?.base ?? null, id).then(
      (fiche) => {
        if (actif) setLecture({ etat: 'pret', id, ...fiche });
      },
      (erreur: unknown) => {
        if (actif) setLecture({ etat: 'erreur', id, erreur });
      },
    );
    return () => {
      actif = false;
    };
  }, [client, horsLigne, id]);

  // Fiche d'une autre bouteille encore affichée : on attend la nouvelle.
  return lecture.id === id ? lecture : { etat: 'chargement' };
}
