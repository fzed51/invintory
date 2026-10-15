// Catégories, seuils et durées de garde (CdC §2.5, §3.9) et manques (CdC §3.7) : formes
// du contrat §9, textes et saisie vérifiée côté front (le serveur garde ses contrôles).
import { WINE_TYPES, wineType, type WineType } from '../design/wine-types.ts';

export type Categorie = {
  id: number;
  type: WineType;
  region: { id: number; name: string } | null;
  threshold: number | null;
  ageing_years: number | null;
  /** Bouteilles en cave de la catégorie (P6 : la générique compte tout son type). */
  count: number;
};

export type Suggestion = {
  domain: string | null;
  vintage: number | null;
  region: string | null;
  grape: string | null;
  last_movement_at: string | null;
};

export type Manque = {
  category: Pick<Categorie, 'id' | 'type' | 'region'>;
  threshold: number;
  count: number;
  missing: number;
  suggestions: Suggestion[];
};

export const MESSAGES_CATEGORIE = {
  typeManquant: 'Type manquant. Choisir le type de vin.',
  seuilInvalide: 'Seuil invalide. Saisir un nombre entier de 0 à 65 535, ou laisser vide.',
  gardeInvalide: 'Durée de garde invalide. Saisir un nombre d’années de 0 à 255, ou laisser vide.',
  regionTropLongue: 'Texte trop long. Saisir au plus 150 caractères.',
  reseauRequis: 'Réseau requis pour modifier les catégories.',
};

const SEUIL_MAX = 65535;
const GARDE_MAX = 255;
const REGION_MAX = 150;

/** « Rouge » pour la générique, « Rouge · Bordeaux » pour une spécifique. */
export function nomCategorie({ type, region }: Pick<Categorie, 'type' | 'region'>): string {
  const libelle = wineType(type).label;
  return region === null ? libelle : `${libelle} · ${region.name}`;
}

export function phraseManque(manquantes: number, seuil: number): string {
  return `Il manque ${manquantes} ${manquantes > 1 ? 'bouteilles' : 'bouteille'} pour atteindre ${seuil}.`;
}

const rangType = (type: WineType) => WINE_TYPES.findIndex((t) => t.id === type);

/** Ordre des types du design system ; la générique d'abord, puis les régions (ordre français). */
export function trierCategories(categories: Categorie[]): Categorie[] {
  return [...categories].sort(
    (a, b) =>
      rangType(a.type) - rangType(b.type) ||
      (a.region === null ? -1 : 0) - (b.region === null ? -1 : 0) ||
      (a.region?.name ?? '').localeCompare(b.region?.name ?? '', 'fr'),
  );
}

function verifierEntier(valeur: string, max: number, message: string): string | undefined {
  if (valeur === '') return undefined;
  return /^\d+$/.test(valeur) && Number(valeur) <= max ? undefined : message;
}

export const verifierSeuil = (valeur: string) => verifierEntier(valeur, SEUIL_MAX, MESSAGES_CATEGORIE.seuilInvalide);
export const verifierGarde = (valeur: string) => verifierEntier(valeur, GARDE_MAX, MESSAGES_CATEGORIE.gardeInvalide);

export function verifierRegion(valeur: string): string | undefined {
  return [...valeur].length > REGION_MAX ? MESSAGES_CATEGORIE.regionTropLongue : undefined;
}

/** Champ numérique facultatif : vide → null (pas de seuil, pas de durée de garde). */
export function versNombre(valeur: string): number | null {
  return valeur === '' ? null : Number(valeur);
}
