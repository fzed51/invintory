import { useState } from 'react';
import { CHEMINS } from '../chemins.ts';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { Field } from '../components/Field.tsx';
import { messageErreur } from '../session/clientApi.ts';
import { useSession } from '../session/contexte.ts';
import { Formulaire, LienDiscret, Page } from './Page.tsx';
import { useEnvoi } from './useEnvoi.ts';

/** Demande de lien de réinitialisation ; la réponse ne dit jamais si le compte existe. */
export function MotDePasseOublie() {
  const { client } = useSession();
  const { enCours, erreur, envoyer } = useEnvoi();
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);

  const demander = () =>
    envoyer(async () => {
      await client.requete('/api/auth/password/forgot', { methode: 'POST', corps: { email }, publique: true });
      setEnvoye(true);
    });

  return (
    <Page titre="Mot de passe oublié">
      {envoye ? (
        <Banner variante="success" titre="Demande envoyée">
          Si un compte existe pour cette adresse, un lien de réinitialisation vient d’y être envoyé. Il expire dans une
          heure.
        </Banner>
      ) : (
        <Formulaire onEnvoi={() => void demander()}>
          <Field
            libelle="Adresse email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {erreur !== null && (
            <Banner variante="danger" titre="Demande refusée">
              {messageErreur(erreur)}
            </Banner>
          )}
          <Button type="submit" variante="primary" bloc disabled={enCours}>
            Recevoir un lien
          </Button>
        </Formulaire>
      )}
      <LienDiscret vers={CHEMINS.connexion}>Se connecter</LienDiscret>
    </Page>
  );
}
