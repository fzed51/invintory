import { useCallback, useEffect, useId, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  effacerBrouillon,
  ecrireBrouillon,
  enregistrerAjout,
  lireBrouillon,
  saisieInitiale,
  type SaisieAjout,
} from '../../ajout/ajout.ts';
import { compresserPhoto, ErreurPhoto } from '../../ajout/photo.ts';
import { memeEmplacement, messagePlace, places, suggestion } from '../../cave/attente.ts';
import { ORIGINES } from '../../cave/format.ts';
import { libelleEmplacement, useCave, type LectureCave } from '../../cave/lecture.ts';
import { useReferentiel } from '../../cave/referentiels.ts';
import type { Emplacement } from '../../cave/types.ts';
import { CHEMINS } from '../../chemins.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Field } from '../../components/Field.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { WINE_TYPES, type WineType } from '../../design/wine-types.ts';
import { useHorsLigne } from '../../hors-ligne/contexte.ts';
import type { Emplacement as Cible } from '../../hors-ligne/mutations.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { ChoixManuel } from '../bouteille/ChoixEmplacement.tsx';
import { cible, HORS_RANGEMENT, placesLibres } from '../bouteille/emplacement.ts';
import { LONGUEURS, verifierDateEntree, verifierMillesime, verifierTexte } from '../bouteille/regles.ts';
import { Section } from '../cave/communs.tsx';
import { Formulaire, LienDiscret } from '../Page.tsx';
import { useErreurs } from '../validation.ts';
import { MESSAGES_AJOUT, verifierQuantite } from './regles.ts';

type Origine = keyof typeof ORIGINES;
const OPTIONS_ORIGINE = (Object.keys(ORIGINES) as Origine[]).map((valeur) => ({ valeur, libelle: ORIGINES[valeur] }));

/** Emplacement demandé par l'adresse (`/add?shelf=12`, `/add?box=4`) : ajout depuis un emplacement. */
function emplacementDemande(parametres: URLSearchParams): Cible | null {
  const etagere = Number(parametres.get('shelf'));
  if (Number.isInteger(etagere) && etagere > 0) return { type: 'etagere', id: etagere };
  const carton = Number(parametres.get('box'));
  if (Number.isInteger(carton) && carton > 0) return { type: 'carton', id: carton };
  return null;
}

type Depart = { saisie: SaisieAjout; reprise: boolean; tour: number };

/**
 * Ajout de bouteilles (CdC §3.3) : unitaire ou en masse, depuis le « + » (emplacement
 * proposé) ou depuis un emplacement (pré-rempli). La saisie est gardée en brouillon à chaque
 * modification (P4) et reprise à la réouverture.
 */
export function AjouterEcran() {
  const horsLigne = useHorsLigne();
  const [depart, setDepart] = useState<Depart | null>(null);

  useEffect(() => {
    let actif = true;
    const lu = horsLigne === null ? Promise.resolve(null) : lireBrouillon(horsLigne.base).catch(() => null);
    void lu.then((brouillon) => {
      if (actif) setDepart({ saisie: brouillon ?? saisieInitiale(), reprise: brouillon !== null, tour: 0 });
    });
    return () => {
      actif = false;
    };
  }, [horsLigne]);

  if (depart === null) return <Banner titre="Chargement du formulaire" />;
  const recommencer = () => setDepart({ saisie: saisieInitiale(), reprise: false, tour: depart.tour + 1 });
  return <Ajout key={depart.tour} depart={depart} recommencer={recommencer} />;
}

type Resultat = { references: (string | null)[]; emplacement: string };

function Ajout({ depart, recommencer }: { depart: Depart; recommencer: () => void }) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  if (resultat !== null) return <Confirmation resultat={resultat} recommencer={recommencer} />;
  return <FormulaireAjout depart={depart} recommencer={recommencer} onAjoute={setResultat} />;
}

/** Ajout mis en file : les codes à recopier sur les étiquettes (CdC §2.3). */
function Confirmation({ resultat, recommencer }: { resultat: Resultat; recommencer: () => void }) {
  const { references, emplacement } = resultat;
  const titre = references.length > 1 ? `${references.length} bouteilles ajoutées` : 'Bouteille ajoutée';
  return (
    <>
      <h1 className="title-1">Ajouter des bouteilles</h1>
      <Banner
        variante="success"
        titre={titre}
        actions={
          <div className="ivt-row" style={{ paddingInline: 0 }}>
            <Button onClick={recommencer}>Ajouter d’autres bouteilles</Button>
            <LienDiscret vers={CHEMINS.cave}>Voir la cave</LienDiscret>
          </div>
        }
      >
        <p style={{ margin: 0 }}>Emplacement : {emplacement}</p>
        <p style={{ margin: 0 }}>{references.length > 1 ? 'Références à noter sur les étiquettes :' : 'Référence à noter sur l’étiquette :'}</p>
        <ul style={{ margin: 0 }}>
          {references.map((reference, i) => (
            <li key={reference ?? `differee-${i}`}>
              {reference === null ? MESSAGES_AJOUT.referenceDifferee : <span className="ivt-ref">{reference}</span>}
            </li>
          ))}
        </ul>
      </Banner>
    </>
  );
}

type Champ = 'quantite' | 'domaine' | 'region' | 'cepage' | 'millesime' | 'dateEntree' | 'note' | 'photo';

type PropsFormulaire = { depart: Depart; recommencer: () => void; onAjoute: (resultat: Resultat) => void };

function FormulaireAjout({ depart, recommencer, onAjoute }: PropsFormulaire) {
  const horsLigne = useHorsLigne();
  const [parametres] = useSearchParams();
  const cave = useCave();
  const { erreurs, verifier, effacer } = useErreurs<Champ>();
  const idType = useId();
  const idRegions = useId();
  const idCepages = useId();
  const regions = useReferentiel('regions');
  const cepages = useReferentiel('grapes');

  const [saisie, setSaisie] = useState(depart.saisie);
  const [demande, setDemande] = useState<Cible | null>(() => emplacementDemande(parametres));
  const [rang, setRang] = useState(0);
  const [manuel, setManuel] = useState(false);
  const [refus, setRefus] = useState<string>();
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [enCours, setEnCours] = useState(false);

  /** Change la saisie et l'enregistre en brouillon (P4). */
  const modifier = (champs: Partial<SaisieAjout>) => {
    const nouvelle = { ...saisie, ...champs };
    setSaisie(nouvelle);
    setRefus(undefined);
    if (horsLigne !== null) void ecrireBrouillon(horsLigne.base, nouvelle).catch(() => undefined);
  };

  const quantite = verifierQuantite(saisie.quantite) === undefined ? Number(saisie.quantite) : 1;
  const { choisie, proposee, candidates } = emplacementCourant(cave, demande, rang, quantite);
  const destination = choisie ?? proposee?.location ?? null;

  const choisir = (emplacement: Emplacement) => {
    setDemande(cible(emplacement));
    setRefus(undefined);
  };

  const changerPhoto = async (evenement: ChangeEvent<HTMLInputElement>) => {
    const fichier = evenement.target.files?.[0];
    if (fichier === undefined) return;
    setPhotoEnCours(true);
    effacer('photo');
    try {
      modifier({ photo: await compresserPhoto(fichier) });
    } catch (erreur) {
      verifier({ photo: erreur instanceof ErreurPhoto ? erreur.message : messageErreur(erreur) } as Record<Champ, string | undefined>);
    } finally {
      setPhotoEnCours(false);
    }
  };

  const ajouter = () => {
    const valide = verifier({
      quantite: verifierQuantite(saisie.quantite),
      domaine: verifierTexte(saisie.domaine, LONGUEURS.domaine),
      region: verifierTexte(saisie.region, LONGUEURS.region),
      cepage: verifierTexte(saisie.cepage, LONGUEURS.cepage),
      millesime: verifierMillesime(saisie.millesime),
      dateEntree: verifierDateEntree(saisie.dateEntree),
      note: undefined,
      photo: undefined,
    });
    if (!valide || horsLigne === null) return;
    if (destination === null) {
      setRefus(MESSAGES_AJOUT.emplacementManquant);
      return;
    }
    if (destination.type !== 'hors_rangement' && cave.etat === 'pret') {
      const place = places(cave.cave).find((p) => memeEmplacement(p.location, destination));
      const message = place === undefined ? MESSAGES_AJOUT.emplacementDisparu : messagePlace(place, quantite);
      if (message !== null) {
        setRefus(message);
        return;
      }
    }
    setEnCours(true);
    enregistrerAjout(horsLigne, saisie, cible(destination)).then(
      ({ references }) => onAjoute({ references, emplacement: libelleEmplacement(destination) }),
      (erreur: unknown) => {
        setRefus(messageErreur(erreur));
        setEnCours(false);
      },
    );
  };

  const abandonner = () => {
    if (horsLigne === null) {
      recommencer();
      return;
    }
    void effacerBrouillon(horsLigne.base).finally(recommencer);
  };

  /** Champ texte de la saisie : valeur, effacement de son erreur à la saisie. */
  const champ = (cle: Champ & keyof SaisieAjout) => ({
    erreur: erreurs[cle],
    value: saisie[cle] as string,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      modifier({ [cle]: e.target.value });
      effacer(cle);
    },
  });

  return (
    <>
      <h1 className="title-1">Ajouter des bouteilles</h1>
      {depart.reprise && (
        <Banner titre="Saisie reprise">
          <p style={{ margin: 0 }}>Le formulaire reprend la saisie interrompue.</p>
        </Banner>
      )}
      <Formulaire onEnvoi={ajouter}>
        <div className="ivt-field">
          <label className="ivt-field__label" htmlFor={idType}>
            Type
          </label>
          <select
            id={idType}
            className="ivt-input"
            value={saisie.type}
            onChange={(e) => modifier({ type: e.target.value as WineType })}
          >
            {WINE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Field libelle="Domaine" {...champ('domaine')} />
        <Field libelle="Région" list={idRegions} autoComplete="off" {...champ('region')} />
        <datalist id={idRegions}>
          {regions.map((nom) => (
            <option key={nom} value={nom} />
          ))}
        </datalist>
        <Field libelle="Cépage" list={idCepages} autoComplete="off" {...champ('cepage')} />
        <datalist id={idCepages}>
          {cepages.map((nom) => (
            <option key={nom} value={nom} />
          ))}
        </datalist>
        <Field libelle="Millésime" inputMode="numeric" aide="Laisser vide pour un vin non millésimé." {...champ('millesime')} />
        <Field libelle="Date d’entrée" type="month" {...champ('dateEntree')} />
        <SegmentedControl
          libelle="Origine"
          options={OPTIONS_ORIGINE}
          valeur={saisie.origine}
          onChange={(origine) => modifier({ origine })}
        />
        <label className="ivt-row" style={{ padding: 0 }}>
          <input type="checkbox" checked={saisie.souvenir} onChange={(e) => modifier({ souvenir: e.target.checked })} />
          Souvenir
        </label>
        <Field libelle="Note" aide="Commune à toutes les bouteilles de l’ajout." {...champ('note')} />
        <Field
          libelle="Photo"
          type="file"
          accept="image/*"
          capture="environment"
          erreur={erreurs.photo}
          onChange={(e) => void changerPhoto(e)}
        />
        {saisie.photo !== null && <Apercu photo={saisie.photo} onRetirer={() => modifier({ photo: null })} />}
        <Field
          libelle="Nombre de bouteilles"
          inputMode="numeric"
          aide="Bouteilles identiques, chacune avec sa propre référence."
          {...champ('quantite')}
        />
        <Section niveau={2} titre="Emplacement">
          <ChoixDeLEmplacement
            cave={cave}
            choisie={choisie}
            proposee={proposee?.location ?? null}
            libres={(choisie === null ? proposee : null)?.libres ?? null}
            candidates={candidates}
            manuel={manuel}
            quantite={quantite}
            onAutre={() => {
              if (choisie === null) setRang((r) => r + 1);
              else setRang(0);
              setDemande(null);
              setManuel(false);
              setRefus(undefined);
            }}
            onManuel={() => setManuel(true)}
            onChoisir={choisir}
            onHorsRangement={() => {
              choisir(HORS_RANGEMENT);
              setManuel(false);
            }}
          />
        </Section>
        {refus !== undefined && (
          <Banner variante="danger" titre="Ajout impossible">
            {refus}
          </Banner>
        )}
        <Button
          type="submit"
          variante="primary"
          bloc
          disabled={enCours || photoEnCours || horsLigne === null || cave.etat === 'chargement'}
        >
          Ajouter
        </Button>
      </Formulaire>
      <Button variante="quiet" onClick={abandonner}>
        Abandonner
      </Button>
    </>
  );
}

/**
 * Emplacement choisi (adresse, choix manuel, Hors rangement) s'il existe dans la cave lue,
 * sinon la proposition (CdC §3.2) pour `quantite` bouteilles.
 */
function emplacementCourant(cave: LectureCave, demande: Cible | null, rang: number, quantite: number) {
  if (demande?.type === 'hors_rangement') return { choisie: HORS_RANGEMENT, proposee: null, candidates: 0 };
  if (cave.etat !== 'pret') return { choisie: null, proposee: null, candidates: 0 };
  const choisie = demande === null ? null : (places(cave.cave).find((p) => memeEmplacement(p.location, demande))?.location ?? null);
  const { place, candidates } = suggestion(cave.cave, HORS_RANGEMENT, rang, quantite);
  return { choisie, proposee: place, candidates };
}

type PropsChoix = {
  cave: LectureCave;
  choisie: Emplacement | null;
  proposee: Emplacement | null;
  /** Place libre de l'emplacement proposé. */
  libres: number | null;
  candidates: number;
  manuel: boolean;
  quantite: number;
  onAutre: () => void;
  onManuel: () => void;
  onChoisir: (emplacement: Emplacement) => void;
  onHorsRangement: () => void;
};

/** Emplacement proposé ou choisi, « Autre emplacement », choix manuel, Hors rangement. */
function ChoixDeLEmplacement(props: PropsChoix) {
  const { cave, choisie, proposee, libres, candidates, manuel, quantite } = props;
  const horsRangement = (
    <Button disabled={choisie?.type === 'hors_rangement'} onClick={props.onHorsRangement}>
      Hors rangement
    </Button>
  );

  if (cave.etat === 'chargement') return <Banner titre="Chargement de la cave" />;
  if (cave.etat === 'erreur') {
    return (
      <>
        {choisie !== null ? <Emplacement titre="Emplacement choisi" emplacement={choisie} /> : <p>{MESSAGES_AJOUT.caveIndisponible}</p>}
        <div className="ivt-row" style={{ padding: 0 }}>
          {horsRangement}
        </div>
      </>
    );
  }

  return (
    <>
      {choisie !== null ? (
        <Emplacement titre="Emplacement choisi" emplacement={choisie} />
      ) : proposee === null ? (
        <p>{MESSAGES_AJOUT.aucunePlace}</p>
      ) : (
        <Emplacement titre="Emplacement proposé" emplacement={proposee} libres={libres} />
      )}
      <div className="ivt-row" style={{ padding: 0 }}>
        <Button variante="quiet" disabled={choisie === null ? candidates < 2 : candidates < 1} onClick={props.onAutre}>
          Autre emplacement
        </Button>
        {!manuel && <Button onClick={props.onManuel}>Choisir manuellement</Button>}
        {horsRangement}
      </div>
      {manuel && (
        <ChoixManuel
          cave={cave.cave}
          bouteilles={cave.bouteilles}
          actuel={null}
          quantite={quantite}
          proposee={null}
          choix={choisie}
          onChoisir={props.onChoisir}
        />
      )}
    </>
  );
}

function Emplacement({ titre, emplacement, libres = null }: { titre: string; emplacement: Emplacement; libres?: number | null }) {
  return (
    <div>
      <p className="label" style={{ margin: 0 }}>
        {titre}
      </p>
      <p className="body-strong" style={{ margin: 0 }}>
        {libelleEmplacement(emplacement)}
      </p>
      {libres !== null && (
        <p className="caption" style={{ margin: 0 }}>
          {placesLibres(libres)}
        </p>
      )}
    </div>
  );
}

/** Photo réduite, affichée par une URL d'objet créée pour l'image et libérée avec elle (Arch §5.1). */
function Apercu({ photo, onRetirer }: { photo: Blob; onRetirer: () => void }) {
  const afficher = useCallback(
    (image: HTMLImageElement | null) => {
      if (image === null) return;
      const url = URL.createObjectURL(photo);
      image.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [photo],
  );

  return (
    <div className="ivt-stack" style={{ padding: 0 }}>
      <img
        ref={afficher}
        alt="Aperçu de la photo"
        style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 'var(--radius-lg)' }}
      />
      <Button variante="quiet" onClick={onRetirer}>
        Retirer la photo
      </Button>
    </div>
  );
}
