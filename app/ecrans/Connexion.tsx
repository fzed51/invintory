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

/** Connexion ; une fois connecté, la garde des routes ramène à l'écran demandé au départ. */
export function Connexion() {
  const { connecter } = useSession();
  const { enCours, erreur, envoyer } = useEnvoi();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const { erreurs, verifier, effacer } = useErreurs<'email' | 'motDePasse'>();

  const connexion = () => {
    if (verifier({ email: verifierEmail(email), motDePasse: verifierMotDePasse(motDePasse) })) {
      void envoyer(() => connecter(email, motDePasse));
    }
  };

  return (
    <Page titre="Invintory" accueil>
      <Formulaire onEnvoi={connexion}>
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
          autoComplete="current-password"
          erreur={erreurs.motDePasse}
          value={motDePasse}
          onChange={(e) => {
            setMotDePasse(e.target.value);
            effacer('motDePasse');
          }}
        />
        {erreur !== null && (
          <Banner variante="danger" titre="Connexion refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" variante="primary" bloc disabled={enCours}>
          Se connecter
        </Button>
      </Formulaire>
      <LienDiscret vers={CHEMINS.inscription}>Créer un compte</LienDiscret>
      <LienDiscret vers={CHEMINS.oubli}>Mot de passe oublié</LienDiscret>
    </Page>
  );
}
