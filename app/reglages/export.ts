/** Nom du fichier d'après `Content-Disposition` (contrat §12) ; à défaut, invintory.zip. */
export function nomDuFichier(entete: string | null): string {
  const nom = /filename="?([^";]+)"?/.exec(entete ?? '')?.[1];
  return nom ?? 'invintory.zip';
}

/** Propose le fichier au téléchargement par le navigateur. */
export function telecharger(contenu: Blob, nom: string): void {
  const adresse = URL.createObjectURL(contenu);
  const lien = document.createElement('a');
  lien.href = adresse;
  lien.download = nom;
  // Rattaché au document le temps du clic (Firefox l'exige), adresse libérée après coup.
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}
