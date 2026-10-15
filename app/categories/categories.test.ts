import { describe, expect, it } from 'vitest';
import {
  MESSAGES_CATEGORIE,
  nomCategorie,
  phraseManque,
  trierCategories,
  verifierGarde,
  verifierRegion,
  verifierSeuil,
  versNombre,
  type Categorie,
} from './categories.ts';

const categorie = (id: number, type: Categorie['type'], region: string | null): Categorie => ({
  id,
  type,
  region: region === null ? null : { id: id * 10, name: region },
  threshold: null,
  ageing_years: null,
  count: 0,
});

describe('nomCategorie', () => {
  it('type seul pour la générique, type · région pour la spécifique', () => {
    expect(nomCategorie(categorie(1, 'rouge', null))).toBe('Rouge');
    expect(nomCategorie(categorie(2, 'rose', 'Provence'))).toBe('Rosé · Provence');
  });
});

describe('phraseManque (DS : une alerte cite la quantité)', () => {
  it('pluriel et singulier', () => {
    expect(phraseManque(2, 6)).toBe('Il manque 2 bouteilles pour atteindre 6.');
    expect(phraseManque(1, 3)).toBe('Il manque 1 bouteille pour atteindre 3.');
  });
});

describe('trierCategories', () => {
  it('dans l’ordre des types, la générique avant ses spécifiques, régions par ordre alphabétique français', () => {
    const lot = [
      categorie(1, 'blanc', 'Bourgogne'),
      categorie(2, 'rouge', 'Rhône'),
      categorie(3, 'rouge', null),
      categorie(4, 'blanc', 'Alsace'),
      categorie(5, 'rouge', 'Écosse'),
      categorie(6, 'rouge', 'Bordeaux'),
    ];

    expect(trierCategories(lot).map((c) => c.id)).toEqual([3, 6, 5, 2, 4, 1]);
    expect(lot.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('Saisie d’une catégorie (contrat §9)', () => {
  it('seuil : vide ou entier de 0 à 65 535', () => {
    expect(verifierSeuil('')).toBeUndefined();
    expect(verifierSeuil('0')).toBeUndefined();
    expect(verifierSeuil('65535')).toBeUndefined();
    for (const saisie of ['65536', '-1', '2.5', 'six', ' 3']) {
      expect(verifierSeuil(saisie)).toBe(MESSAGES_CATEGORIE.seuilInvalide);
    }
  });

  it('durée de garde : vide ou entier de 0 à 255', () => {
    expect(verifierGarde('')).toBeUndefined();
    expect(verifierGarde('255')).toBeUndefined();
    expect(verifierGarde('256')).toBe(MESSAGES_CATEGORIE.gardeInvalide);
    expect(verifierGarde('1e2')).toBe(MESSAGES_CATEGORIE.gardeInvalide);
  });

  it('région : facultative, 150 caractères au plus', () => {
    expect(verifierRegion('')).toBeUndefined();
    expect(verifierRegion('é'.repeat(150))).toBeUndefined();
    expect(verifierRegion('a'.repeat(151))).toBe(MESSAGES_CATEGORIE.regionTropLongue);
  });

  it('champ vide → null, sinon le nombre', () => {
    expect(versNombre('')).toBeNull();
    expect(versNombre('12')).toBe(12);
  });
});
