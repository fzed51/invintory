/**
 * Photo à la capture (Arch §5.1) : plus grand côté ramené à `cote` pixels, encodée en JPEG
 * (Safari n'encode pas le WebP par `toBlob`). Le serveur recompresse et fait la miniature.
 */
export const PHOTO = { cote: 1600, qualite: 0.85 } as const;

/** Image que le navigateur ne sait pas lire ou réencoder. */
export class ErreurPhoto extends Error {
  constructor() {
    super('Photo illisible. Choisir une autre image.');
    this.name = 'ErreurPhoto';
  }
}

/**
 * Réduit et réencode une photo avant de la garder dans IndexedDB (une photo brute de
 * téléphone pèse 5 à 10 Mo). Jamais agrandie ; l'orientation EXIF est appliquée au décodage.
 */
export async function compresserPhoto(fichier: Blob): Promise<Blob> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    throw new ErreurPhoto();
  }
  const echelle = Math.min(1, PHOTO.cote / Math.max(image.width, image.height));
  const toile = document.createElement('canvas');
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  try {
    const contexte = toile.getContext('2d');
    if (contexte === null) throw new ErreurPhoto();
    contexte.drawImage(image, 0, 0, toile.width, toile.height);
  } finally {
    image.close();
  }
  const jpeg = await new Promise<Blob | null>((rendre) => toile.toBlob(rendre, 'image/jpeg', PHOTO.qualite));
  if (jpeg === null) throw new ErreurPhoto();
  return jpeg;
}
