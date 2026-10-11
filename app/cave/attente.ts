import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { BaseHorsLigne } from '../hors-ligne/base.ts';
import { migrer, type Emplacement as Cible, type Mutation } from '../hors-ligne/mutations.ts';
import { nomEtagere } from './format.ts';
import type { Bouteille, Carton, Cave, Emplacement, Etagere, Mouvement } from './types.ts';

// Mouvements en attente de synchronisation superposés aux lectures (copie locale ou réponse
// du serveur) : un déplacement ou une sortie se voit dès sa mise en file, en ligne comme hors
// ligne, jusqu'à ce que le serveur le reflète.

/** Mutation de la file, sous sa forme courante. */
export type EnAttente = { client_ref: string; mutation: Mutation };

/** Mouvement en attente, affiché dans l'historique de la fiche. */
export type MouvementEnAttente = Omit<Mouvement, 'id'>;

/** Emplacement de rangement (étagère ou carton) et sa place. */
export type Place = { location: Emplacement; capacite: number; occupees: number; libres: number };

const HORS_RANGEMENT: Emplacement = { type: 'hors_rangement' };

/**
 * Mutations de la file du compte, tenues à jour à chaque écriture ; null le temps de la
 * première lecture. Sans base locale : aucune.
 */
export function useEnAttente(base: BaseHorsLigne | null): EnAttente[] | null {
  const [attente, setAttente] = useState<{ base: BaseHorsLigne; liste: EnAttente[] } | null>(null);

  useEffect(() => {
    if (base === null) return;
    const abonnement = liveQuery(async () => {
      const liste: EnAttente[] = [];
      for (const entree of await base.file.orderBy('ordre').toArray()) {
        const mutation = migrer(entree);
        if (mutation !== null) liste.push({ client_ref: entree.client_ref, mutation });
      }
      return liste;
    }).subscribe({ next: (liste) => setAttente({ base, liste }) });
    return () => abonnement.unsubscribe();
  }, [base]);

  if (base === null) return [];
  return attente?.base === base ? attente.liste : null;
}

/** Même emplacement (type et id). */
export function memeEmplacement(a: Emplacement | Cible, b: Emplacement | Cible): boolean {
  return a.type === b.type && (a.type === 'hors_rangement' || a.id === (b as { id: number }).id);
}

function placeEtagere(armoire: Cave['cabinets'][number], etagere: Etagere): Place {
  return {
    location: { type: 'etagere', id: etagere.id, cabinet_id: armoire.id, label: `${armoire.name} · ${nomEtagere(etagere)}` },
    capacite: etagere.capacity,
    occupees: etagere.occupied,
    libres: Math.max(0, etagere.capacity - etagere.occupied),
  };
}

function placeCarton(carton: Carton): Place {
  return {
    location: { type: 'carton', id: carton.id, label: carton.label },
    capacite: carton.capacity,
    occupees: carton.occupied,
    libres: Math.max(0, carton.capacity - carton.occupied),
  };
}

/**
 * Étagères puis cartons, dans l'ordre de `/api/cellar` (armoires par id, étagères par
 * position puis id, cartons par id) : l'ordre de parcours de la suggestion (contrat §5).
 */
export function places(cave: Cave): Place[] {
  return [
    ...cave.cabinets.flatMap((armoire) => armoire.shelves.map((etagere) => placeEtagere(armoire, etagere))),
    ...cave.boxes.map(placeCarton),
  ];
}

/**
 * Suggestion d'emplacement (CdC §3.2), reproduite sur la cave lue : `rang`-ième place libre
 * (« Autre emplacement » l'augmente, puis revient à la première), hors emplacement actuel.
 */
export function suggestion(cave: Cave, actuel: Emplacement, rang: number): { place: Place | null; candidates: number } {
  const candidates = places(cave).filter((place) => place.libres > 0 && !memeEmplacement(place.location, actuel));
  if (candidates.length === 0) return { place: null, candidates: 0 };
  return { place: candidates[rang % candidates.length], candidates: candidates.length };
}

/** Refus d'un emplacement complet : la règle et le maximum (DS, voix et ton). */
export function messageComplet({ location, capacite, occupees }: Place): string {
  if (location.type === 'carton') {
    return `Carton complet : ${occupees} bouteilles sur ${capacite} sont rangées. Choisissez un autre emplacement.`;
  }
  return `Étagère complète : ${occupees} alvéoles sur ${capacite} sont occupées. Choisissez un autre emplacement.`;
}

/** Compteurs modifiables d'une copie de la cave. */
function copier(cave: Cave): Cave {
  return {
    cabinets: cave.cabinets.map((armoire) => ({ ...armoire, shelves: armoire.shelves.map((e) => ({ ...e })) })),
    boxes: cave.boxes.map((carton) => ({ ...carton })),
    unplaced: cave.unplaced,
  };
}

/** Compteur d'occupation d'un emplacement de la copie ; null pour Hors rangement ou inconnu. */
function compteur(cave: Cave, emplacement: Emplacement | Cible): Etagere | Carton | null {
  if (emplacement.type === 'etagere') {
    return cave.cabinets.flatMap((a) => a.shelves).find((e) => e.id === emplacement.id) ?? null;
  }
  if (emplacement.type === 'carton') return cave.boxes.find((c) => c.id === emplacement.id) ?? null;
  return null;
}

function liberer(cave: Cave, emplacement: Emplacement): void {
  const place = compteur(cave, emplacement);
  if (emplacement.type === 'hors_rangement') cave.unplaced = Math.max(0, cave.unplaced - 1);
  else if (place !== null) place.occupied = Math.max(0, place.occupied - 1);
}

function occuper(cave: Cave, emplacement: Emplacement): void {
  const place = compteur(cave, emplacement);
  if (emplacement.type === 'hors_rangement') cave.unplaced++;
  else if (place !== null) place.occupied++;
}

/** Emplacement complet de la cible, d'après la cave ; null si elle n'y est pas. */
function resoudre(cave: Cave, cible: Cible): Place | null {
  return places(cave).find((place) => memeEmplacement(place.location, cible)) ?? null;
}

/**
 * Cave et bouteilles en cave telles qu'elles seront après la file. Comme le serveur
 * (contrat §10.4), un emplacement complet ou disparu mène en Hors rangement. Un mouvement
 * déjà reflété par la lecture (bouteille déjà à destination, ou déjà sortie) ne change rien.
 */
export function superposerCave(
  lue: { cave: Cave; bouteilles: Bouteille[] },
  attente: EnAttente[],
): { cave: Cave; bouteilles: Bouteille[] } {
  const mouvements = attente.filter(({ mutation }) => mutation.kind !== 'add');
  if (mouvements.length === 0) return lue;

  const cave = copier(lue.cave);
  let bouteilles = lue.bouteilles;
  for (const { mutation } of mouvements) {
    if (mutation.kind === 'add') continue;
    const bouteille = bouteilles.find((b) => b.client_ref === mutation.bottle);
    if (bouteille === undefined) continue;

    if (mutation.kind === 'exit') {
      liberer(cave, bouteille.location);
      bouteilles = bouteilles.filter((b) => b !== bouteille);
      continue;
    }
    if (memeEmplacement(bouteille.location, mutation.location)) continue;
    const place = mutation.location.type === 'hors_rangement' ? null : resoudre(cave, mutation.location);
    const destination = place !== null && place.libres > 0 ? place.location : HORS_RANGEMENT;
    if (memeEmplacement(bouteille.location, destination)) continue;
    liberer(cave, bouteille.location);
    occuper(cave, destination);
    bouteilles = bouteilles.map((b) => (b === bouteille ? { ...b, location: destination } : b));
  }
  return { cave, bouteilles };
}

/** Libellé d'une cible sans la cave lue : connu seulement pour Hors rangement. */
const EN_ATTENTE = 'Emplacement en attente';

/**
 * Fiche telle qu'elle sera après la file : emplacement et statut de la bouteille, et ses
 * mouvements en attente pour l'historique. `cave` donne le libellé des destinations.
 */
export function superposerFiche(
  bouteille: Bouteille,
  cave: Cave | null,
  attente: EnAttente[],
): { bouteille: Bouteille; enAttente: MouvementEnAttente[] } {
  let courante = bouteille;
  const enAttente: MouvementEnAttente[] = [];
  for (const { client_ref, mutation } of attente) {
    if (mutation.kind === 'add' || mutation.bottle !== bouteille.client_ref || courante.status === 'sortie') continue;
    const { occurred_at } = mutation;

    if (mutation.kind === 'exit') {
      enAttente.push({ client_ref, type: 'sortie', exit_reason: mutation.exit_reason, from: courante.location, to: null, occurred_at });
      courante = { ...courante, status: 'sortie', location: HORS_RANGEMENT };
      continue;
    }
    const cible = mutation.location;
    let destination: Emplacement;
    if (cible.type === 'hors_rangement') destination = HORS_RANGEMENT;
    else if (cave === null) destination = { ...cible, label: EN_ATTENTE } as Emplacement;
    else destination = resoudre(cave, cible)?.location ?? HORS_RANGEMENT;
    enAttente.push({ client_ref, type: 'deplacement', exit_reason: null, from: courante.location, to: destination, occurred_at });
    courante = { ...courante, location: destination };
  }
  return { bouteille: courante, enAttente };
}
