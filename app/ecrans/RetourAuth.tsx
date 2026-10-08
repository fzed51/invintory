import { Navigate, useSearchParams } from 'react-router';
import { CHEMINS } from '../chemins.ts';
import { Banner } from '../components/Banner.tsx';
import { LienDiscret, Page } from './Page.tsx';

type Issue = {
  variante: 'success' | 'warning' | 'danger';
  titre: string;
  texte: string;
  lien: string;
  vers: string;
};

const CONFIRMEE: Issue = {
  variante: 'success',
  titre: 'Adresse confirmée',
  texte: 'Le compte est actif.',
  lien: 'Se connecter',
  vers: CHEMINS.connexion,
};
const ADRESSE_CHANGEE: Issue = {
  variante: 'success',
  titre: 'Nouvelle adresse confirmée',
  texte: 'La nouvelle adresse sert désormais à se connecter.',
  lien: 'Revenir à la cave',
  vers: CHEMINS.cave,
};
const NOUVELLE_DEMANDE = { lien: 'Refaire une demande', vers: CHEMINS.oubli };

/** Issue de chaque couple type/status du callback (contrat §3, intégration §2). */
const ISSUES: Record<string, Record<string, Issue> | undefined> = {
  user_registration: {
    confirmed: CONFIRMEE,
    already_confirmed: CONFIRMEE,
    expired: {
      variante: 'warning',
      titre: 'Lien expiré',
      texte: 'Recommencer l’inscription pour recevoir un nouveau lien.',
      lien: 'Recommencer l’inscription',
      vers: CHEMINS.inscription,
    },
  },
  password_reset: {
    already_confirmed: {
      variante: 'warning',
      titre: 'Lien déjà utilisé',
      texte: 'Refaire une demande si le mot de passe n’a pas été changé.',
      ...NOUVELLE_DEMANDE,
    },
    expired: {
      variante: 'warning',
      titre: 'Lien expiré',
      texte: 'Le lien n’est valable qu’une heure : refaire une demande.',
      ...NOUVELLE_DEMANDE,
    },
  },
  email_change: {
    confirmed: ADRESSE_CHANGEE,
    already_confirmed: ADRESSE_CHANGEE,
    expired: {
      variante: 'warning',
      titre: 'Lien expiré',
      texte: 'Refaire le changement d’adresse depuis les réglages.',
      lien: 'Ouvrir les réglages',
      vers: CHEMINS.reglages,
    },
    email_taken: {
      variante: 'danger',
      titre: 'Adresse déjà utilisée',
      texte: 'Cette adresse appartient déjà à un autre compte : en choisir une autre depuis les réglages.',
      lien: 'Ouvrir les réglages',
      vers: CHEMINS.reglages,
    },
  },
};

const INCONNUE: Issue = {
  variante: 'danger',
  titre: 'Lien non reconnu',
  texte: 'Le lien est incomplet ou invalide.',
  lien: 'Revenir à la cave',
  vers: CHEMINS.cave,
};

/** Page de retour après un lien reçu par email (redirection du callback de l'API). */
export function RetourAuth() {
  const [parametres] = useSearchParams();
  const type = parametres.get('type') ?? '';
  const statut = parametres.get('status') ?? '';

  // Le jeton de réinitialisation est déjà en cookie : saisir le nouveau mot de passe.
  if (type === 'password_reset' && statut === 'confirmed') {
    return <Navigate to={CHEMINS.nouveauMotDePasse} replace />;
  }

  const issue = ISSUES[type]?.[statut] ?? INCONNUE;

  return (
    <Page titre="Invintory">
      <Banner variante={issue.variante} titre={issue.titre}>
        {issue.texte}
      </Banner>
      <LienDiscret vers={issue.vers}>{issue.lien}</LienDiscret>
    </Page>
  );
}
