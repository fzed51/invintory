// Textes de la fiche bouteille : dates en français, libellés du vocabulaire du DS.

export const ORIGINES = { achetee: 'Achetée', offerte: 'Offerte' } as const;
export const MOTIFS_SORTIE = { consommee: 'Consommée', offerte: 'Offerte', perdue_cassee: 'Perdue-cassée' } as const;
export const TYPES_MOUVEMENT = { entree: 'Entrée', deplacement: 'Déplacement', sortie: 'Sortie' } as const;

// Dates sans heure (AAAA-MM, AAAA-MM-JJ) lues en UTC : pas de glissement d'un jour selon le fuseau.
const MOIS_ANNEE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const JOUR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const JOUR_LOCAL = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const HEURE_LOCALE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « octobre 2026 » pour une date d'entrée `2026-10`. */
export function moisAnnee(valeur: string): string {
  return MOIS_ANNEE.format(new Date(`${valeur}-01T00:00:00Z`));
}

/** « 31 décembre 2026 » pour `2026-12-31`. */
export function dateJour(valeur: string): string {
  return JOUR.format(new Date(`${valeur}T00:00:00Z`));
}

/** « 7 octobre 2026 à 14:00 », à l'heure de l'appareil, pour un instant ISO 8601. */
export function dateHeure(instant: string): string {
  const date = new Date(instant);
  return `${JOUR_LOCAL.format(date)} à ${HEURE_LOCALE.format(date)}`;
}

/** Référence saisie à la main : comparée sans casse ni espaces (contrat §7.2). */
export function normaliserReference(saisie: string): string {
  return saisie.replace(/\s+/g, '').toLowerCase();
}
