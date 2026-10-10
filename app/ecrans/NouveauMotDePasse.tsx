import { useState } from 'react';
import { CHEMINS } from '../chemins.ts';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { Field } from '../components/Field.tsx';
import { ErreurApi, messageErreur } from '../session/clientApi.ts';
import { useSession } from '../session/contexte.ts';
import { Formulaire, LienDiscret, Page } from './Page.tsx';
import { useEnvoi } from './useEnvoi.ts';
import { useErreurs, verifierMotDePasse } from './validation.ts';

/**
 * Saisie du nouveau mot de passe après le lien reçu par email : le jeton de réinitialisation
 * est dans le cookie ivt_reinit, posé par le callback. Le succès révoque toutes les sessions.
 */
export function NouveauMotDePasse() {
  const { client, oublier } = useSession();
  const { enCours, erreur, envoyer } = useEnvoi();
  const [motDePasse, setMotDePasse] = useState('');
  const [change, setChange] = useState(false);
  const { erreurs, verifier, effacer } = useErreurs<'motDePasse'>();

  const enregistrer = () => {
    if (!verifier({ motDePasse: verifierMotDePasse(motDePasse, { longueur: true }) })) return;
    void envoyer(async () => {
      await client.requete('/api/auth/password/reset', {
        methode: 'POST',
        corps: { password: motDePasse },
        publique: true,
      });
      oublier();
      setChange(true);
    });
  };

  if (change) {
    return (
      <Page titre="Nouveau mot de passe">
        <Banner variante="success" titre="Mot de passe changé">
          Toutes les sessions ont été fermées. Se connecter avec le nouveau mot de passe.
        </Banner>
        <LienDiscret vers={CHEMINS.connexion}>Se connecter</LienDiscret>
      </Page>
    );
  }

  const lienInvalide = erreur instanceof ErreurApi && erreur.code === 'RESET_TOKEN_INVALID';

  return (
    <Page titre="Nouveau mot de passe">
      <Formulaire onEnvoi={enregistrer}>
        <Field
          libelle="Nouveau mot de passe"
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
        {erreur !== null && (
          <Banner variante="danger" titre="Changement refusé">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" variante="primary" bloc disabled={enCours}>
          Enregistrer le mot de passe
        </Button>
      </Formulaire>
      {lienInvalide && <LienDiscret vers={CHEMINS.oubli}>Refaire une demande</LienDiscret>}
    </Page>
  );
}
