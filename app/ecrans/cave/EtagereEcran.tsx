import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { nomEtagere } from '../../cave/lecture.ts';
import type { Armoire, Etagere } from '../../cave/types.ts';
import { cheminArmoire } from '../../chemins.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Field } from '../../components/Field.tsx';
import { useEnLigne } from '../../hors-ligne/etat.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { Formulaire } from '../Page.tsx';
import { useEnvoi } from '../useEnvoi.ts';
import { useErreurs } from '../validation.ts';
import { AvecCave, AvisReseau, Introuvable, LienTexte, Suppression } from './communs.tsx';
import { verifierCapacite, verifierLibelle } from './regles.ts';

/** Modification d'une étagère (nom, nombre d'alvéoles) et suppression (en ligne). */
export function EtagereEcran() {
  const id = Number(useParams().id);
  return (
    <AvecCave>
      {({ cave }) => {
        const armoire = cave.cabinets.find((a) => a.shelves.some((e) => e.id === id));
        const etagere = armoire?.shelves.find((e) => e.id === id);
        if (armoire === undefined || etagere === undefined) return <Introuvable titre="Étagère introuvable" />;
        return <EtagereChargee key={etagere.id} armoire={armoire} etagere={etagere} />;
      }}
    </AvecCave>
  );
}

function EtagereChargee({ armoire, etagere }: { armoire: Armoire; etagere: Etagere }) {
  const { client } = useSession();
  const naviguer = useNavigate();
  const possible = useEnLigne();
  const { enCours, erreur, envoyer } = useEnvoi();
  const { erreurs, verifier, effacer } = useErreurs<'nom' | 'capacite'>();
  const [nom, setNom] = useState(etagere.name ?? '');
  const [capacite, setCapacite] = useState(String(etagere.capacity));
  const retour = () => void naviguer(cheminArmoire(armoire.id));

  const enregistrer = () => {
    const trouvees = { nom: verifierLibelle(nom, null), capacite: verifierCapacite(capacite, etagere.occupied) };
    if (!verifier(trouvees)) return;
    void envoyer(async () => {
      await client.requete(`/api/shelves/${etagere.id}`, {
        methode: 'PATCH',
        corps: { name: nom === '' ? null : nom, capacity: Number(capacite) },
      });
      retour();
    });
  };

  return (
    <>
      <h1 className="title-1">{nomEtagere(etagere)}</h1>
      <p>
        <LienTexte vers={cheminArmoire(armoire.id)}>{armoire.name}</LienTexte>
      </p>
      <p className="caption">
        {etagere.occupied} / {etagere.capacity} alvéoles
      </p>
      <AvisReseau />
      <Formulaire onEnvoi={enregistrer}>
        <Field
          libelle="Nom (facultatif)"
          aide={`Sans nom, elle s’appelle « Étagère ${etagere.position} ».`}
          erreur={erreurs.nom}
          value={nom}
          onChange={(e) => {
            setNom(e.target.value);
            effacer('nom');
          }}
        />
        <Field
          libelle="Nombre d’alvéoles"
          inputMode="numeric"
          erreur={erreurs.capacite}
          value={capacite}
          onChange={(e) => {
            setCapacite(e.target.value);
            effacer('capacite');
          }}
        />
        {erreur !== null && (
          <Banner variante="danger" titre="Modification refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" variante="primary" bloc disabled={enCours || !possible}>
          Enregistrer
        </Button>
      </Formulaire>
      <Suppression
        quoi="etagere"
        bouteilles={etagere.occupied}
        route={`/api/shelves/${etagere.id}`}
        possible={possible}
        onSupprime={retour}
      />
    </>
  );
}
