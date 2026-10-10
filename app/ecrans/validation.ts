import { useState } from 'react';

// Validation des formulaires de compte, côté front pour des messages cohérents (P35) ; le
// serveur (et auth-service derrière lui) garde ses propres contrôles en garde-fou.

export const MESSAGES = {
  emailManquant: 'Adresse email manquante. Saisir l’adresse du compte.',
  emailInvalide: 'Adresse email invalide. Vérifier la saisie, par exemple nom@exemple.fr.',
  motDePasseManquant: 'Mot de passe manquant. Saisir le mot de passe.',
  motDePasseCourt: 'Mot de passe trop court. Saisir au moins 8 caractères.',
  motDePasseLong: 'Mot de passe trop long. Saisir au plus 72 caractères ; un caractère accentué compte pour deux.',
};

// Forme générale seulement (une partie locale, un @, un domaine avec un point, sans espace) :
// le contrôle exact reste celui du serveur.
const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// auth-service compte la longueur du mot de passe en octets UTF-8 (8 à 72 ; intégration §2.5).
const OCTETS_MIN = 8;
const OCTETS_MAX = 72;

export function verifierEmail(email: string): string | undefined {
  if (email === '') return MESSAGES.emailManquant;
  if (!FORME_EMAIL.test(email)) return MESSAGES.emailInvalide;
  return undefined;
}

/** `longueur` : règles d'un nouveau mot de passe ; à la connexion, seule la présence compte. */
export function verifierMotDePasse(motDePasse: string, { longueur = false } = {}): string | undefined {
  if (motDePasse === '') return MESSAGES.motDePasseManquant;
  if (!longueur) return undefined;
  const octets = new TextEncoder().encode(motDePasse).length;
  if (octets < OCTETS_MIN) return MESSAGES.motDePasseCourt;
  if (octets > OCTETS_MAX) return MESSAGES.motDePasseLong;
  return undefined;
}

export function sansErreur(erreurs: Record<string, string | undefined>): boolean {
  return Object.values(erreurs).every((message) => message === undefined);
}

/** Erreurs de saisie d'un formulaire, par champ ; celle d'un champ s'efface dès qu'il change. */
export function useErreurs<Champ extends string>() {
  const [erreurs, setErreurs] = useState<Partial<Record<Champ, string>>>({});

  return {
    erreurs,
    /** Retient les erreurs trouvées ; vrai si la saisie peut partir. */
    verifier(trouvees: Record<Champ, string | undefined>): boolean {
      setErreurs(trouvees);
      return sansErreur(trouvees);
    },
    effacer(champ: Champ) {
      setErreurs((actuelles) => ({ ...actuelles, [champ]: undefined }));
    },
  };
}
