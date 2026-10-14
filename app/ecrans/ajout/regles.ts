// Ajout de bouteilles (CdC §3.3) : saisie vérifiée avant la mise en file. Les autres champs
// suivent les règles de la fiche (bouteille/regles.ts).

/** Bouteilles d'un même ajout (contrat §10.1). */
export const QUANTITE_MAX = 100;

export const MESSAGES_AJOUT = {
  quantiteInvalide: `Nombre invalide. Saisir un nombre de bouteilles de 1 à ${QUANTITE_MAX}.`,
  emplacementManquant: 'Emplacement manquant. Choisir une étagère, un carton ou Hors rangement.',
  aucunePlace: 'Aucune étagère ni aucun carton n’a la place pour ces bouteilles.',
  referenceDifferee: 'Référence attribuée à la synchronisation',
  caveIndisponible: 'Cave indisponible sans réseau : seul Hors rangement est possible.',
  emplacementDisparu: 'Emplacement introuvable. Il a peut-être été supprimé depuis un autre appareil.',
};

export function verifierQuantite(saisie: string): string | undefined {
  if (!/^[1-9]\d{0,2}$/.test(saisie) || Number(saisie) > QUANTITE_MAX) return MESSAGES_AJOUT.quantiteInvalide;
  return undefined;
}
