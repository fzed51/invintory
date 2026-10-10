import { describe, expect, it } from 'vitest';
import { MESSAGES, sansErreur, verifierEmail, verifierMotDePasse } from './validation.ts';

describe('Validation des formulaires (P35 : côté front, le serveur reste un garde-fou)', () => {
  it('email : obligatoire', () => {
    expect(verifierEmail('')).toBe(MESSAGES.emailManquant);
  });

  it.each(['x', 'a@b', 'a@exemple', ' a@exemple.fr', 'a@exemple.fr ', 'a b@exemple.fr', 'a@@exemple.fr', '@exemple.fr'])(
    'email invalide : « %s »',
    (email) => {
      expect(verifierEmail(email)).toBe(MESSAGES.emailInvalide);
    },
  );

  it.each(['a@exemple.fr', 'prenom.nom+cave@sous.exemple.com'])('email valide : « %s »', (email) => {
    expect(verifierEmail(email)).toBeUndefined();
  });

  it('mot de passe : obligatoire', () => {
    expect(verifierMotDePasse('')).toBe(MESSAGES.motDePasseManquant);
    expect(verifierMotDePasse('', { longueur: true })).toBe(MESSAGES.motDePasseManquant);
  });

  it('mot de passe à la connexion : aucune règle de longueur', () => {
    expect(verifierMotDePasse('court')).toBeUndefined();
  });

  it('nouveau mot de passe : 8 à 72 octets, comme auth-service', () => {
    expect(verifierMotDePasse('a'.repeat(7), { longueur: true })).toBe(MESSAGES.motDePasseCourt);
    expect(verifierMotDePasse('a'.repeat(8), { longueur: true })).toBeUndefined();
    expect(verifierMotDePasse('a'.repeat(72), { longueur: true })).toBeUndefined();
    expect(verifierMotDePasse('a'.repeat(73), { longueur: true })).toBe(MESSAGES.motDePasseLong);
  });

  it('un caractère accentué compte pour deux octets', () => {
    expect(verifierMotDePasse('é'.repeat(4), { longueur: true })).toBeUndefined();
    expect(verifierMotDePasse('é'.repeat(36), { longueur: true })).toBeUndefined();
    expect(verifierMotDePasse('é'.repeat(37), { longueur: true })).toBe(MESSAGES.motDePasseLong);
  });

  it('sansErreur : vrai seulement si aucun champ n’a de message', () => {
    expect(sansErreur({ email: undefined, password: undefined })).toBe(true);
    expect(sansErreur({ email: undefined, password: MESSAGES.motDePasseCourt })).toBe(false);
  });
});
