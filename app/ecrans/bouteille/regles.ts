// Saisie de la fiche vérifiée côté front (comme P35) ; le serveur garde ses contrôles
// (contrat §7.3 : millésime 1000–9999, date AAAA-MM, région et cépage 150 caractères,
// domaine 255).

export const MESSAGES_FICHE = {
  millesimeInvalide: 'Millésime invalide. Saisir une année de 1000 à 9999, ou laisser vide pour un vin non millésimé.',
  dateEntreeInvalide: 'Date d’entrée manquante. Choisir le mois et l’année.',
  referenceManquante: 'Référence manquante. Saisir le code noté sur l’étiquette.',
  reseauRequis: 'Réseau requis pour modifier la fiche.',
};

export const LONGUEURS = { region: 150, cepage: 150, domaine: 255 } as const;

export function texteTropLong(max: number): string {
  return `Texte trop long. Saisir au plus ${max} caractères.`;
}

export function verifierMillesime(valeur: string): string | undefined {
  if (valeur === '') return undefined;
  if (!/^\d{4}$/.test(valeur) || Number(valeur) < 1000) return MESSAGES_FICHE.millesimeInvalide;
  return undefined;
}

export function verifierDateEntree(valeur: string): string | undefined {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(valeur) ? undefined : MESSAGES_FICHE.dateEntreeInvalide;
}

/** Texte facultatif borné. */
export function verifierTexte(valeur: string, max: number): string | undefined {
  return [...valeur].length > max ? texteTropLong(max) : undefined;
}
