import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { rangeesDans } from '../../cave/lecture.ts';
import type { Carton } from '../../cave/types.ts';
import { CHEMINS, cheminCarton } from '../../chemins.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Field } from '../../components/Field.tsx';
import { useEnLigne } from '../../hors-ligne/etat.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { Formulaire } from '../Page.tsx';
import { useEnvoi } from '../useEnvoi.ts';
import { useErreurs } from '../validation.ts';
import { AvecCave, AvisReseau, Introuvable, ListeBouteilles, Section, Suppression } from './communs.tsx';
import { MESSAGES_EMPLACEMENT, verifierCapacite, verifierLibelle } from './regles.ts';

/** Identifiant et capacité d'un carton, vérifiés avant l'envoi. */
function useSaisieCarton(carton?: Carton) {
  const { erreurs, verifier, effacer } = useErreurs<'identifiant' | 'capacite'>();
  const [identifiant, setIdentifiant] = useState(carton?.label ?? '');
  const [capacite, setCapacite] = useState(carton === undefined ? '' : String(carton.capacity));

  const champs = (
    <>
      <Field
        libelle="Identifiant du carton"
        erreur={erreurs.identifiant}
        value={identifiant}
        onChange={(e) => {
          setIdentifiant(e.target.value);
          effacer('identifiant');
        }}
      />
      <Field
        libelle="Nombre de bouteilles"
        inputMode="numeric"
        erreur={erreurs.capacite}
        value={capacite}
        onChange={(e) => {
          setCapacite(e.target.value);
          effacer('capacite');
        }}
      />
    </>
  );

  const valide = () =>
    verifier({
      identifiant: verifierLibelle(identifiant, MESSAGES_EMPLACEMENT.identifiantManquant),
      capacite: verifierCapacite(capacite, carton?.occupied ?? 0),
    });

  return { champs, valide, corps: () => ({ label: identifiant, capacity: Number(capacite) }) };
}

/** Création d'un carton (CdC §3.1 : identifiant + capacité). */
export function NouveauCarton() {
  const { client } = useSession();
  const naviguer = useNavigate();
  const possible = useEnLigne();
  const { enCours, erreur, envoyer } = useEnvoi();
  const saisie = useSaisieCarton();

  const creer = () => {
    if (!saisie.valide()) return;
    void envoyer(async () => {
      const cree = await client.requete<Carton>('/api/boxes', { methode: 'POST', corps: saisie.corps() });
      void naviguer(cheminCarton(cree.id), { replace: true });
    });
  };

  return (
    <>
      <h1 className="title-1">Nouveau carton</h1>
      <AvisReseau />
      <Formulaire onEnvoi={creer}>
        {saisie.champs}
        {erreur !== null && (
          <Banner variante="danger" titre="Création refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" variante="primary" bloc disabled={enCours || !possible}>
          Créer le carton
        </Button>
      </Formulaire>
    </>
  );
}

/** Carton : ses bouteilles, puis sa modification et sa suppression (en ligne). */
export function CartonEcran() {
  const id = Number(useParams().id);
  return (
    <AvecCave>
      {({ cave, bouteilles, recharger }) => {
        const carton = cave.boxes.find((c) => c.id === id);
        if (carton === undefined) return <Introuvable titre="Carton introuvable" />;
        return (
          <>
            <h1 className="title-1">{carton.label}</h1>
            <p className="caption">
              {carton.occupied} / {carton.capacity} bouteilles
            </p>
            <ListeBouteilles bouteilles={rangeesDans(bouteilles, carton.id)} />
            <ModifierCarton key={carton.id} carton={carton} recharger={recharger} />
          </>
        );
      }}
    </AvecCave>
  );
}

function ModifierCarton({ carton, recharger }: { carton: Carton; recharger: () => void }) {
  const { client } = useSession();
  const naviguer = useNavigate();
  const possible = useEnLigne();
  const { enCours, erreur, envoyer } = useEnvoi();
  const saisie = useSaisieCarton(carton);

  const enregistrer = () => {
    if (!saisie.valide()) return;
    void envoyer(async () => {
      await client.requete(`/api/boxes/${carton.id}`, { methode: 'PATCH', corps: saisie.corps() });
      recharger();
    });
  };

  return (
    <Section niveau={2} titre="Modifier le carton">
      <AvisReseau />
      <Formulaire onEnvoi={enregistrer}>
        {saisie.champs}
        {erreur !== null && (
          <Banner variante="danger" titre="Modification refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" disabled={enCours || !possible}>
          Enregistrer
        </Button>
      </Formulaire>
      <Suppression
        quoi="carton"
        bouteilles={carton.occupied}
        route={`/api/boxes/${carton.id}`}
        possible={possible}
        onSupprime={() => void naviguer(CHEMINS.cave)}
      />
    </Section>
  );
}
