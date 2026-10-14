// Recherche pour un repas (CdC §3.6) : calculée par la PWA sur la cave lue, comme la
// suggestion d'emplacement (P42), pour marcher hors ligne et inclure les mouvements en
// attente. Mêmes règles que `GET /api/bottles` (contrat §7.2).
import type { Bouteille } from '../cave/types.ts';
import type { WineType } from '../design/wine-types.ts';

export type FiltresRepas = { type: WineType | null; region: string | null; cepage: string | null };
export type TriRepas = 'priorite' | 'age';

export const AUCUN_FILTRE: FiltresRepas = { type: null, region: null, cepage: null };

/** Comparaison des noms comme la base (`utf8mb4_0900_as_ci`) : accents comptés, casse ignorée. */
const memeNom = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'accent' }) === 0;

const correspond = (nom: string | undefined, filtre: string | null) =>
  filtre === null || (nom !== undefined && memeNom(nom, filtre));

/** Bouteilles en cave qui répondent aux trois filtres ; les souvenirs restent (badge). */
export function filtrerRepas(bouteilles: Bouteille[], filtres: FiltresRepas): Bouteille[] {
  return bouteilles.filter(
    (b) =>
      b.status === 'en_cave' &&
      (filtres.type === null || b.type === filtres.type) &&
      correspond(b.region?.name, filtres.region) &&
      correspond(b.grape?.name, filtres.cepage),
  );
}

/** Noms distincts (la première orthographe rencontrée), dans l'ordre alphabétique français. */
function distincts(noms: (string | undefined)[]): string[] {
  const gardes: string[] = [];
  for (const nom of noms) {
    if (nom !== undefined && !gardes.some((garde) => memeNom(garde, nom))) gardes.push(nom);
  }
  return gardes.sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Régions et cépages des bouteilles en cave : seuls choix qui donnent un résultat. */
export function optionsRepas(bouteilles: Bouteille[]): { regions: string[]; cepages: string[] } {
  const enCave = bouteilles.filter((b) => b.status === 'en_cave');
  return {
    regions: distincts(enCave.map((b) => b.region?.name)),
    cepages: distincts(enCave.map((b) => b.grape?.name)),
  };
}

/** Date limite d'un ajout en attente : inconnue (calculée par le serveur), rangée en dernier. */
const dateLimite = (b: Bouteille) => (b.drink_by === '' ? '9999-12-31' : b.drink_by);

const COMPARAISONS: Record<TriRepas, (a: Bouteille, b: Bouteille) => number> = {
  // Dates dépassées d'abord, puis les plus proches (contrat §13.3).
  priorite: (a, b) => dateLimite(a).localeCompare(dateLimite(b)) || a.age_year - b.age_year || a.id - b.id,
  age: (a, b) => a.age_year - b.age_year || a.id - b.id,
};

export function trierRepas(bouteilles: Bouteille[], tri: TriRepas): Bouteille[] {
  return [...bouteilles].sort(COMPARAISONS[tri]);
}
