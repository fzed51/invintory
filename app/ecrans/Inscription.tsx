import { useState } from 'react';
import { CHEMINS } from '../chemins.ts';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { Field } from '../components/Field.tsx';
import { messageErreur } from '../session/clientApi.ts';
import { useSession } from '../session/contexte.ts';
import { Formulaire, LienDiscret, Page } from './Page.tsx';
import { useEnvoi } from './useEnvoi.ts';
import { useErreurs, verifierEmail, verifierMotDePasse } from './validation.ts';

/** Inscription, puis renvoi du lien de confirmation à la demande. */
export function Inscription() {
  const { client } = useSession();
  const { enCours, erreur, envoyer } = useEnvoi();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [renvoye, setRenvoye] = useState(false);
  const { erreurs, verifier, effacer } = useErreurs<'email' | 'motDePasse'>();

  const inscrire = () => {
    if (!verifier({ email: verifierEmail(email), motDePasse: verifierMotDePasse(motDePasse, { longueur: true }) })) {
      return;
    }
    void envoyer(async () => {
      await client.requete('/api/auth/register', {
        methode: 'POST',
        corps: { email, password: motDePasse },
        publique: true,
      });
      setEnvoye(true);
    });
  };

  const renvoyer = () =>
    envoyer(async () => {
      setRenvoye(false);
      await client.requete('/api/auth/register/resend', { methode: 'POST', corps: { email }, publique: true });
      setRenvoye(true);
    });

  return (
    <Page titre="Créer un compte">
      {envoye ? (
        <Banner
          variante="success"
          titre="Lien de confirmation envoyé"
          actions={
            <Button onClick={() => void renvoyer()} disabled={enCours}>
              Renvoyer le lien
            </Button>
          }
        >
          <p>Ouvrir le lien envoyé à {email} pour activer le compte.</p>
          {renvoye && <p>Nouveau lien envoyé à {email}.</p>}
        </Banner>
      ) : (
        <Formulaire onEnvoi={inscrire}>
          <Field
            libelle="Adresse email"
            type="email"
            autoComplete="email"
            erreur={erreurs.email}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              effacer('email');
            }}
          />
          <Field
            libelle="Mot de passe"
            type="password"
            autoComplete="new-password"
            aide="Entre 8 et 72 caractères."
            erreur={erreurs.motDePasse}
            value={motDePasse}
            onChange={(e) => {
              setMotDePasse(e.target.value);
              effacer('motDePasse');
            }}
          />
          <Button type="submit" variante="primary" bloc disabled={enCours}>
            Créer le compte
          </Button>
        </Formulaire>
      )}
      {erreur !== null && (
        <Banner variante="danger" titre={envoye ? 'Renvoi refusé' : 'Inscription refusée'}>
          {messageErreur(erreur)}
        </Banner>
      )}
      <LienDiscret vers={CHEMINS.connexion}>Se connecter</LienDiscret>
    </Page>
  );
}
