import { useState } from 'react';
import { CHEMINS } from '../chemins.ts';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { Field } from '../components/Field.tsx';
import { messageErreur } from '../session/clientApi.ts';
import { useSession } from '../session/contexte.ts';
import { Formulaire, LienDiscret, Page } from './Page.tsx';
import { useEnvoi } from './useEnvoi.ts';

/** Connexion ; une fois connecté, la garde des routes ramène à l'écran demandé au départ. */
export function Connexion() {
  const { connecter } = useSession();
  const { enCours, erreur, envoyer } = useEnvoi();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');

  return (
    <Page titre="Invintory" accueil>
      <Formulaire onEnvoi={() => void envoyer(() => connecter(email, motDePasse))}>
        <Field
          libelle="Adresse email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          libelle="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
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
