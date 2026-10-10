import { describe, expect, it } from 'vitest';
import { dateHeure, dateJour, MOTIFS_SORTIE, moisAnnee, normaliserReference, ORIGINES } from './format.ts';

describe('Formats de la fiche bouteille', () => {
  it('date d’entrée (année et mois) : « octobre 2026 »', () => {
    expect(moisAnnee('2026-10')).toBe('octobre 2026');
    expect(moisAnnee('2025-01')).toBe('janvier 2025');
  });

  it('date limite (jour) : « 31 décembre 2026 », sans décalage de fuseau', () => {
    expect(dateJour('2026-12-31')).toBe('31 décembre 2026');
    expect(dateJour('2027-01-01')).toBe('1 janvier 2027');
  });

  it('date d’un mouvement : jour et heure locale', () => {
    expect(dateHeure('2026-10-07T12:00:00.000Z')).toMatch(/^7 octobre 2026 à \d{2}:\d{2}$/);
  });

  it('libellés : origine et motif de sortie (vocabulaire du DS)', () => {
    expect(ORIGINES).toEqual({ achetee: 'Achetée', offerte: 'Offerte' });
    expect(MOTIFS_SORTIE).toEqual({ consommee: 'Consommée', offerte: 'Offerte', perdue_cassee: 'Perdue-cassée' });
  });

  it('référence saisie : minuscules, espaces retirés (contrat §7.2)', () => {
    expect(normaliserReference(' A7 ')).toBe('a7');
    expect(normaliserReference('k 7 b')).toBe('k7b');
    expect(normaliserReference('   ')).toBe('');
  });
});
