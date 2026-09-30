/** Les six types de vin (liste fixe du cahier des charges), dans l'ordre d'affichage. */
export type WineType = "rouge" | "blanc" | "rose" | "effervescent" | "doux" | "autre";

export interface WineTypeInfo {
  id: WineType;
  /** Libellé affiché : « Rouge », « Rosé »… */
  label: string;
  /** Jeton de couleur du repère (pastille, alvéole occupée). */
  token: string;
  /** Jeton du fond de badge. */
  tint: string;
  /** Classe CSS du badge de ce type. */
  badgeClass: string;
}

const info = (id: WineType, label: string): WineTypeInfo => ({
  id,
  label,
  token: `wine-${id}`,
  tint: `wine-${id}-tint`,
  badgeClass: `ivt-badge--${id}`,
});

export const WINE_TYPES: readonly WineTypeInfo[] = [
  info("rouge", "Rouge"),
  info("blanc", "Blanc"),
  info("rose", "Rosé"),
  info("effervescent", "Effervescent"),
  info("doux", "Doux"),
  info("autre", "Autre"),
];

/** Info d'un type de vin ; un identifiant inconnu retombe sur « autre ». */
export function wineType(id: string): WineTypeInfo {
  return WINE_TYPES.find((w) => w.id === id) ?? WINE_TYPES[WINE_TYPES.length - 1];
}

/** Assemble des noms de classes en ignorant les valeurs fausses. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
