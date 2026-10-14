import { describe, expect, it } from 'vitest';
import { MESSAGES_AJOUT, QUANTITE_MAX, verifierQuantite } from './regles.ts';

describe('Nombre de bouteilles d’un ajout (contrat §10.1 : 1 à 100)', () => {
  it.each(['1', '6', '100'])('« %s » accepté', (saisie) => {
    expect(verifierQuantite(saisie)).toBeUndefined();
  });

  it.each(['', '0', '101', '-1', '2,5', '2.5', ' 3', 'six', '007'])('« %s » refusé', (saisie) => {
    expect(verifierQuantite(saisie)).toBe(MESSAGES_AJOUT.quantiteInvalide);
  });

  it('le maximum est celui du contrat', () => {
    expect(QUANTITE_MAX).toBe(100);
    expect(MESSAGES_AJOUT.quantiteInvalide).toContain('100');
  });
});
