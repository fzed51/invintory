import { describe, expect, it } from 'vitest';
import { MESSAGES_EMPLACEMENT, messageOccupation, verifierCapacite, verifierLibelle } from './regles.ts';

describe('Règles de saisie des emplacements (contrat §5)', () => {
  it('libellé obligatoire : vide refusé avec le message donné', () => {
    expect(verifierLibelle('', MESSAGES_EMPLACEMENT.nomManquant)).toBe(MESSAGES_EMPLACEMENT.nomManquant);
    expect(verifierLibelle('Cave du bas', MESSAGES_EMPLACEMENT.nomManquant)).toBeUndefined();
  });

  it('libellé facultatif : vide accepté', () => {
    expect(verifierLibelle('', null)).toBeUndefined();
  });

  it('libellé : 100 caractères au plus (accents compris comme un caractère)', () => {
    expect(verifierLibelle('é'.repeat(100), null)).toBeUndefined();
    expect(verifierLibelle('a'.repeat(101), null)).toBe(MESSAGES_EMPLACEMENT.libelleTropLong);
  });

  it.each(['', '0', '-1', '1.5', '65536', 'douze', ' 6'])('capacité invalide : « %s »', (valeur) => {
    expect(verifierCapacite(valeur)).toBe(MESSAGES_EMPLACEMENT.capaciteInvalide);
  });

  it.each(['1', '12', '65535'])('capacité valide : « %s »', (valeur) => {
    expect(verifierCapacite(valeur)).toBeUndefined();
  });

  it('capacité sous l’occupation actuelle : refusée, avec l’occupation (même message que le serveur)', () => {
    expect(verifierCapacite('1', 2)).toBe(messageOccupation(2));
    expect(verifierCapacite('2', 2)).toBeUndefined();
    expect(messageOccupation(2)).toBe('Capacité inférieure à l’occupation actuelle : 2 bouteilles rangées.');
    expect(messageOccupation(1)).toBe('Capacité inférieure à l’occupation actuelle : 1 bouteille rangée.');
  });
});
