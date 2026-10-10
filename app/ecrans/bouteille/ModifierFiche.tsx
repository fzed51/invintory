import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useFiche } from '../../cave/fiche.ts';
import { ORIGINES } from '../../cave/format.ts';
import type { Bouteille } from '../../cave/types.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Field } from '../../components/Field.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { WINE_TYPES, type WineType } from '../../design/wine-types.ts';
import { useEnLigne } from '../../hors-ligne/etat.ts';
import { ErreurApi, messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { Introuvable } from '../cave/communs.tsx';
import { Formulaire, LienDiscret } from '../Page.tsx';
import { useEnvoi } from '../useEnvoi.ts';
import { useErreurs } from '../validation.ts';
import { LONGUEURS, MESSAGES_FICHE, verifierDateEntree, verifierMillesime, verifierTexte } from './regles.ts';

type Origine = keyof typeof ORIGINES;
const OPTIONS_ORIGINE = (Object.keys(ORIGINES) as Origine[]).map((valeur) => ({ valeur, libelle: ORIGINES[valeur] }));

/** Modification de la fiche (contrat §7.3, en ligne uniquement — P7). */
export function ModifierFiche() {
  const id = Number(useParams().id);
  const lecture = useFiche(id);

  if (lecture.etat === 'chargement') return <Banner titre="Chargement de la fiche" />;
  if (lecture.etat === 'erreur') {
    if (lecture.erreur instanceof ErreurApi && lecture.erreur.code === 'NOT_FOUND') {
      return <Introuvable titre="Bouteille introuvable" detail="Aucune bouteille de cette cave ne porte ce numéro." />;
    }
    return (
      <Banner variante="danger" titre="Fiche indisponible">
        {messageErreur(lecture.erreur)}
      </Banner>
    );
  }
  return <FormulaireFiche key={lecture.bouteille.id} bouteille={lecture.bouteille} />;
}

/** Noms connus d'un référentiel, pour l'autocomplétion ; liste vide si le serveur ne répond pas. */
function useReferentiel(route: '/api/regions' | '/api/grapes'): string[] {
  const { client } = useSession();
  const [noms, setNoms] = useState<string[]>([]);
  useEffect(() => {
    let actif = true;
    const cle = route === '/api/regions' ? 'regions' : 'grapes';
    client.requete<Record<string, { name: string }[]>>(route).then(
      (reponse) => {
        if (actif) setNoms((reponse[cle] ?? []).map((r) => r.name));
      },
      () => {},
    );
    return () => {
      actif = false;
    };
  }, [client, route]);
  return noms;
}

function FormulaireFiche({ bouteille }: { bouteille: Bouteille }) {
  const { client } = useSession();
  const naviguer = useNavigate();
  const enLigne = useEnLigne();
  const { enCours, erreur, envoyer } = useEnvoi();
  const { erreurs, verifier, effacer } = useErreurs<'domaine' | 'region' | 'cepage' | 'millesime' | 'dateEntree'>();
  const idType = useId();
  const idRegions = useId();
  const idCepages = useId();
  const regions = useReferentiel('/api/regions');
  const cepages = useReferentiel('/api/grapes');

  const [type, setType] = useState<WineType>(bouteille.type);
  const [domaine, setDomaine] = useState(bouteille.domain ?? '');
  const [region, setRegion] = useState(bouteille.region?.name ?? '');
  const [cepage, setCepage] = useState(bouteille.grape?.name ?? '');
  const [millesime, setMillesime] = useState(bouteille.vintage === null ? '' : String(bouteille.vintage));
  const [dateEntree, setDateEntree] = useState(bouteille.entry_date);
  const [origine, setOrigine] = useState<Origine>(bouteille.origin as Origine);
  const [souvenir, setSouvenir] = useState(bouteille.souvenir);
  const [note, setNote] = useState(bouteille.note ?? '');
  const fiche = `/bottles/${bouteille.id}`;
  const ouNull = (valeur: string) => (valeur === '' ? null : valeur);

  const enregistrer = () => {
    const valide = verifier({
      domaine: verifierTexte(domaine, LONGUEURS.domaine),
      region: verifierTexte(region, LONGUEURS.region),
      cepage: verifierTexte(cepage, LONGUEURS.cepage),
      millesime: verifierMillesime(millesime),
      dateEntree: verifierDateEntree(dateEntree),
    });
    if (!valide) return;
    void envoyer(async () => {
      await client.requete(`/api/bottles/${bouteille.id}`, {
        methode: 'PATCH',
        corps: {
          type,
          region: ouNull(region),
          grape: ouNull(cepage),
          domain: ouNull(domaine),
          vintage: millesime === '' ? null : Number(millesime),
          entry_date: dateEntree,
          origin: origine,
          note: ouNull(note),
          souvenir,
        },
      });
      void naviguer(fiche);
    });
  };

  /** Champ texte : valeur, effacement de son erreur à la saisie. */
  const champ = (cle: Parameters<typeof effacer>[0], valeur: string, changer: (v: string) => void) => ({
    erreur: erreurs[cle],
    value: valeur,
    onChange: (e: { target: { value: string } }) => {
      changer(e.target.value);
      effacer(cle);
    },
  });

  return (
    <>
      <h1 className="title-1">Modifier la fiche</h1>
      <p>
        Référence <span className="ivt-ref">{bouteille.reference.toLowerCase()}</span>
      </p>
      {!enLigne && <p>{MESSAGES_FICHE.reseauRequis}</p>}
      <Formulaire onEnvoi={enregistrer}>
        <div className="ivt-field">
          <label className="ivt-field__label" htmlFor={idType}>
            Type
          </label>
          <select id={idType} className="ivt-input" value={type} onChange={(e) => setType(e.target.value as WineType)}>
            {WINE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Field libelle="Domaine" {...champ('domaine', domaine, setDomaine)} />
        <Field libelle="Région" list={idRegions} autoComplete="off" {...champ('region', region, setRegion)} />
        <datalist id={idRegions}>
          {regions.map((nom) => (
            <option key={nom} value={nom} />
          ))}
        </datalist>
        <Field libelle="Cépage" list={idCepages} autoComplete="off" {...champ('cepage', cepage, setCepage)} />
        <datalist id={idCepages}>
          {cepages.map((nom) => (
            <option key={nom} value={nom} />
          ))}
        </datalist>
        <Field
          libelle="Millésime"
          inputMode="numeric"
          aide="Laisser vide pour un vin non millésimé."
          {...champ('millesime', millesime, setMillesime)}
        />
        <Field libelle="Date d’entrée" type="month" {...champ('dateEntree', dateEntree, setDateEntree)} />
        <SegmentedControl libelle="Origine" options={OPTIONS_ORIGINE} valeur={origine} onChange={setOrigine} />
        <label className="ivt-row" style={{ padding: 0 }}>
          <input type="checkbox" checked={souvenir} onChange={(e) => setSouvenir(e.target.checked)} />
          Souvenir
        </label>
        <Field libelle="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        {erreur !== null && (
          <Banner variante="danger" titre="Modification refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" variante="primary" bloc disabled={enCours || !enLigne}>
          Enregistrer
        </Button>
      </Formulaire>
      <LienDiscret vers={fiche}>Annuler</LienDiscret>
    </>
  );
}
