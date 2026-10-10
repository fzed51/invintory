// Saisie des emplacements vérifiée côté front, comme les formulaires de compte (P35) ; le
// serveur garde ses contrôles (contrat §5 : libellés de 1 à 100 caractères, capacité de 1
// à 65 535, capacité jamais sous l'occupation — P5).

export const MESSAGES_EMPLACEMENT = {
  nomManquant: 'Nom manquant. Saisir le nom de l’armoire.',
  identifiantManquant: 'Identifiant manquant. Saisir l’identifiant du carton.',
  libelleTropLong: 'Texte trop long. Saisir au plus 100 caractères.',
  capaciteInvalide: 'Capacité invalide. Saisir un nombre entier de 1 à 65 535.',
  reseauRequis: 'Réseau requis pour modifier les emplacements.',
};

const LIBELLE_MAX = 100;
const CAPACITE_MAX = 65535;

/** `manquant` : message si le champ est vide ; null pour un champ facultatif. */
export function verifierLibelle(valeur: string, manquant: string | null): string | undefined {
  if (valeur === '') return manquant ?? undefined;
  if ([...valeur].length > LIBELLE_MAX) return MESSAGES_EMPLACEMENT.libelleTropLong;
  return undefined;
}

/** Même texte que le refus 409 `CAPACITY_BELOW_OCCUPANCY` du serveur. */
export function messageOccupation(occupees: number): string {
  return `Capacité inférieure à l’occupation actuelle : ${occupees} ${occupees > 1 ? 'bouteilles rangées' : 'bouteille rangée'}.`;
}

/** `occupees` : bouteilles déjà rangées, sous lesquelles la capacité ne peut descendre. */
export function verifierCapacite(valeur: string, occupees = 0): string | undefined {
  if (!/^\d+$/.test(valeur)) return MESSAGES_EMPLACEMENT.capaciteInvalide;
  const capacite = Number(valeur);
  if (capacite < 1 || capacite > CAPACITE_MAX) return MESSAGES_EMPLACEMENT.capaciteInvalide;
  if (capacite < occupees) return messageOccupation(occupees);
  return undefined;
}
