import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compresserPhoto, ErreurPhoto, PHOTO } from './photo.ts';

// jsdom ne dessine pas : createImageBitmap et le contexte 2D du canvas sont simulés.

type Toile = { largeur: number; hauteur: number; type?: string; qualite?: unknown };

let toiles: Toile[];
let dessins: unknown[][];
let encodage: Blob | null;
let fermee: ReturnType<typeof vi.fn>;

function image(largeur: number, hauteur: number) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: largeur, height: hauteur, close: fermee })),
  );
}

beforeEach(() => {
  toiles = [];
  dessins = [];
  encodage = new Blob(['jpeg'], { type: 'image/jpeg' });
  fermee = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { drawImage: (...args: unknown[]) => dessins.push(args) } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    rappel: BlobCallback,
    type?: string,
    qualite?: unknown,
  ) {
    toiles.push({ largeur: this.width, hauteur: this.height, type, qualite });
    rappel(encodage);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fichier = () => new Blob(['brut'], { type: 'image/jpeg' });

describe('compresserPhoto (Arch §5.1)', () => {
  it('paysage plus grand que 1600 px : réduit à 1600 px de large, proportions gardées, JPEG', async () => {
    image(4000, 3000);

    const photo = await compresserPhoto(fichier());

    expect(toiles).toEqual([{ largeur: 1600, hauteur: 1200, type: 'image/jpeg', qualite: PHOTO.qualite }]);
    expect(dessins[0].slice(1)).toEqual([0, 0, 1600, 1200]);
    expect(photo).toBe(encodage);
  });

  it('portrait : le plus grand côté (la hauteur) ramené à 1600 px', async () => {
    image(3024, 4032);

    await compresserPhoto(fichier());

    expect(toiles[0]).toMatchObject({ largeur: 1200, hauteur: 1600 });
  });

  it('image déjà petite : jamais agrandie, réencodée en JPEG', async () => {
    image(800, 600);

    await compresserPhoto(fichier());

    expect(toiles[0]).toMatchObject({ largeur: 800, hauteur: 600, type: 'image/jpeg' });
  });

  it('libère l’image décodée après le dessin', async () => {
    image(4000, 3000);

    await compresserPhoto(fichier());

    expect(fermee).toHaveBeenCalledOnce();
  });

  it('image illisible (format non décodé par le navigateur) : ErreurPhoto', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new DOMException('bad', 'InvalidStateError'))));

    await expect(compresserPhoto(fichier())).rejects.toBeInstanceOf(ErreurPhoto);
  });

  it('encodage JPEG impossible (toBlob rend null) : ErreurPhoto', async () => {
    image(4000, 3000);
    encodage = null;

    await expect(compresserPhoto(fichier())).rejects.toBeInstanceOf(ErreurPhoto);
  });
});
