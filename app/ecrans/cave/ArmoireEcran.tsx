import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { nomEtagere, rangeesSur } from '../../cave/lecture.ts';
import type { Armoire as ArmoireApi, Bouteille } from '../../cave/types.ts';
import { CHEMINS, cheminEtagere } from '../../chemins.ts';
import { Armoire } from '../../components/Armoire.tsx';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Field } from '../../components/Field.tsx';
import { ShelfGrid } from '../../components/ShelfGrid.tsx';
import { useEnLigne } from '../../hors-ligne/etat.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { Formulaire } from '../Page.tsx';
import { useEnvoi } from '../useEnvoi.ts';
import { useErreurs } from '../validation.ts';
import { AvecCave, AvisReseau, Introuvable, Section, Suppression } from './communs.tsx';
import { MESSAGES_EMPLACEMENT, verifierCapacite, verifierLibelle } from './regles.ts';

/** Armoire : vue visuelle (CdC §3.1, une ligne par étagère), puis sa gestion (en ligne). */
export function ArmoireEcran() {
  const id = Number(useParams().id);
  return (
    <AvecCave>
      {({ cave, bouteilles, recharger }) => {
        const armoire = cave.cabinets.find((a) => a.id === id);
        if (armoire === undefined) return <Introuvable titre="Armoire introuvable" />;
        return <ArmoireChargee armoire={armoire} bouteilles={bouteilles} recharger={recharger} />;
      }}
    </AvecCave>
  );
}

function ArmoireChargee({
  armoire,
  bouteilles,
  recharger,
}: {
  armoire: ArmoireApi;
  bouteilles: Bouteille[];
  recharger: () => void;
}) {
  const naviguer = useNavigate();
  const possible = useEnLigne();
  const rangees = armoire.shelves.reduce((total, etagere) => total + etagere.occupied, 0);

  return (
    <>
      <h1 className="title-1">{armoire.name}</h1>
      <Armoire nom={armoire.name} titreVisible={false}>
        {armoire.shelves.map((etagere) => (
          <ShelfGrid
            key={etagere.id}
            nom={nomEtagere(etagere)}
            capacite={etagere.capacity}
            occupation={rangeesSur(bouteilles, etagere.id).map((b) => b.type)}
          />
        ))}
      </Armoire>
      {armoire.shelves.length === 0 && <p>Aucune étagère.</p>}
      <AvisReseau />
      {armoire.shelves.length > 0 && (
        <Section niveau={2} titre="Étagères">
          <ul className="ivt-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {armoire.shelves.map((etagere) => (
              <li key={etagere.id} className="ivt-row" style={{ padding: 0 }}>
                <span className="body-strong">{nomEtagere(etagere)}</span>
                <Link
                  className="ivt-btn ivt-btn--quiet"
                  to={cheminEtagere(etagere.id)}
                  aria-label={`Modifier ${nomEtagere(etagere)}`}
                >
                  Modifier
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Renommer armoire={armoire} possible={possible} recharger={recharger} />
      <AjouterEtagere armoire={armoire} possible={possible} recharger={recharger} />
      <Suppression
        quoi="armoire"
        bouteilles={rangees}
        route={`/api/cabinets/${armoire.id}`}
        possible={possible}
        onSupprime={() => void naviguer(CHEMINS.cave)}
      />
    </>
  );
}

function Renommer({ armoire, possible, recharger }: { armoire: ArmoireApi; possible: boolean; recharger: () => void }) {
  const { client } = useSession();
  const { enCours, erreur, envoyer } = useEnvoi();
  const { erreurs, verifier, effacer } = useErreurs<'nom'>();
  const [nom, setNom] = useState(armoire.name);

  const renommer = () => {
    if (!verifier({ nom: verifierLibelle(nom, MESSAGES_EMPLACEMENT.nomManquant) })) return;
    void envoyer(async () => {
      await client.requete(`/api/cabinets/${armoire.id}`, { methode: 'PATCH', corps: { name: nom } });
      recharger();
    });
  };

  return (
    <Formulaire onEnvoi={renommer}>
      <Field
        libelle="Nom de l’armoire"
        erreur={erreurs.nom}
        value={nom}
        onChange={(e) => {
          setNom(e.target.value);
          effacer('nom');
        }}
      />
      {erreur !== null && (
        <Banner variante="danger" titre="Modification refusée">
          {messageErreur(erreur)}
        </Banner>
      )}
      <Button type="submit" disabled={enCours || !possible}>
        Renommer
      </Button>
    </Formulaire>
  );
}

function AjouterEtagere({
  armoire,
  possible,
  recharger,
}: {
  armoire: ArmoireApi;
  possible: boolean;
  recharger: () => void;
}) {
  const { client } = useSession();
  const { enCours, erreur, envoyer } = useEnvoi();
  const { erreurs, verifier, effacer } = useErreurs<'nom' | 'capacite'>();
  const [nom, setNom] = useState('');
  const [capacite, setCapacite] = useState('');

  const ajouter = () => {
    if (!verifier({ nom: verifierLibelle(nom, null), capacite: verifierCapacite(capacite) })) return;
    void envoyer(async () => {
      await client.requete(`/api/cabinets/${armoire.id}/shelves`, {
        methode: 'POST',
        corps: { ...(nom !== '' && { name: nom }), capacity: Number(capacite) },
      });
      setNom('');
      setCapacite('');
      recharger();
    });
  };

  return (
    <Section niveau={2} titre="Ajouter une étagère">
      <Formulaire onEnvoi={ajouter}>
        <Field
          libelle="Nom (facultatif)"
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
          <Banner variante="danger" titre="Ajout refusé">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" disabled={enCours || !possible}>
          Ajouter
        </Button>
      </Formulaire>
    </Section>
  );
}
