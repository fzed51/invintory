import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Armoire } from '../../cave/types.ts';
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
import { AvisReseau } from './communs.tsx';
import { MESSAGES_EMPLACEMENT, verifierCapacite, verifierLibelle } from './regles.ts';

type LigneEtagere = { cle: number; nom: string; capacite: string };

/** Création d'une armoire avec ses étagères (CdC §3.1), de haut en bas. */
export function NouvelleArmoire() {
  const { client } = useSession();
  const naviguer = useNavigate();
  const possible = useEnLigne();
  const { enCours, erreur, envoyer } = useEnvoi();
  const { erreurs, verifier, effacer } = useErreurs<string>();
  const [nom, setNom] = useState('');
  const prochaine = useRef(1);
  const [etageres, setEtageres] = useState<LigneEtagere[]>([{ cle: 0, nom: '', capacite: '' }]);

  const modifier = (cle: number, champ: 'nom' | 'capacite', valeur: string) => {
    setEtageres((lignes) => lignes.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)));
    effacer(`${champ}-${cle}`);
  };

  const creer = () => {
    const trouvees: Record<string, string | undefined> = { nom: verifierLibelle(nom, MESSAGES_EMPLACEMENT.nomManquant) };
    for (const l of etageres) {
      trouvees[`nom-${l.cle}`] = verifierLibelle(l.nom, null);
      trouvees[`capacite-${l.cle}`] = verifierCapacite(l.capacite);
    }
    if (!verifier(trouvees)) return;
    void envoyer(async () => {
      const creee = await client.requete<Armoire>('/api/cabinets', {
        methode: 'POST',
        corps: {
          name: nom,
          shelves: etageres.map((l) => ({ ...(l.nom !== '' && { name: l.nom }), capacity: Number(l.capacite) })),
        },
      });
      void naviguer(cheminArmoire(creee.id), { replace: true });
    });
  };

  return (
    <>
      <h1 className="title-1">Nouvelle armoire</h1>
      <AvisReseau />
      <Formulaire onEnvoi={creer}>
        <Field
          libelle="Nom de l’armoire"
          erreur={erreurs.nom}
          value={nom}
          onChange={(e) => {
            setNom(e.target.value);
            effacer('nom');
          }}
        />
        {etageres.map((l, index) => (
          <fieldset key={l.cle} className="ivt-stack" style={{ padding: 0, margin: 0, border: 0 }}>
            <legend className="body-strong">Étagère {index + 1}</legend>
            <Field
              libelle={`Étagère ${index + 1} : nom (facultatif)`}
              erreur={erreurs[`nom-${l.cle}`]}
              value={l.nom}
              onChange={(e) => modifier(l.cle, 'nom', e.target.value)}
            />
            <Field
              libelle={`Étagère ${index + 1} : nombre d’alvéoles`}
              inputMode="numeric"
              erreur={erreurs[`capacite-${l.cle}`]}
              value={l.capacite}
              onChange={(e) => modifier(l.cle, 'capacite', e.target.value)}
            />
            <Button
              variante="quiet"
              aria-label={`Retirer l’étagère ${index + 1}`}
              onClick={() => setEtageres((lignes) => lignes.filter((x) => x.cle !== l.cle))}
            >
              Retirer
            </Button>
          </fieldset>
        ))}
        <Button
          onClick={() => {
            const cle = prochaine.current++;
            setEtageres((lignes) => [...lignes, { cle, nom: '', capacite: '' }]);
          }}
        >
          Ajouter une étagère
        </Button>
        {erreur !== null && (
          <Banner variante="danger" titre="Création refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" variante="primary" bloc disabled={enCours || !possible}>
          Créer l’armoire
        </Button>
      </Formulaire>
    </>
  );
}
