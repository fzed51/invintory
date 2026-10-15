import { useId, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  MESSAGES_CATEGORIE,
  nomCategorie,
  trierCategories,
  verifierGarde,
  verifierRegion,
  verifierSeuil,
  versNombre,
  type Categorie,
} from '../../categories/categories.ts';
import { useCategories, type Lecture } from '../../categories/lecture.ts';
import { useReferentiel } from '../../cave/referentiels.ts';
import { CHEMINS, cheminCategorie } from '../../chemins.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Field } from '../../components/Field.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { WINE_TYPES, cx, type WineType } from '../../design/wine-types.ts';
import { useEnLigne } from '../../hors-ligne/etat.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { Introuvable, LienBouton } from '../cave/communs.tsx';
import { Formulaire } from '../Page.tsx';
import { useEnvoi } from '../useEnvoi.ts';
import { useErreurs } from '../validation.ts';

const LISTE = { listStyle: 'none', margin: 0, padding: 0 } as const;

const AIDES = {
  seuil: 'Sous ce nombre de bouteilles en cave, la catégorie passe en manque.',
  garde: 'Date limite de consommation : millésime (ou date d’entrée) + durée de garde.',
};

const enCave = (n: number) => `${n} ${n > 1 ? 'bouteilles' : 'bouteille'} en cave`;

/** « Seuil : 6 · Garde : 8 ans · 9 bouteilles en cave ». */
function resume({ threshold, ageing_years, count }: Categorie): string {
  return [
    threshold === null ? 'Sans seuil' : `Seuil : ${threshold}`,
    ageing_years === null ? 'Sans durée de garde' : `Garde : ${ageing_years} ${ageing_years > 1 ? 'ans' : 'an'}`,
    enCave(count),
  ].join(' · ');
}

/** Rend son contenu une fois les catégories lues ; chargement et échec sont dits à sa place. */
function AvecCategories({ lecture, children }: { lecture: Lecture<Categorie[]>; children: (categories: Categorie[]) => ReactNode }) {
  if (lecture.etat === 'chargement') return <Banner titre="Chargement des catégories" />;
  if (lecture.etat === 'erreur') {
    return (
      <Banner variante="danger" titre="Catégories indisponibles">
        {messageErreur(lecture.erreur)}
      </Banner>
    );
  }
  return children(lecture.donnees);
}

/** Catégories en ligne uniquement (contrat §2) : hors ligne, le dit. */
function AvisReseau() {
  return useEnLigne() ? null : <p>{MESSAGES_CATEGORIE.reseauRequis}</p>;
}

/** Catégories du compte (CdC §2.5, §3.9) : chacune ouvre sa modification. */
export function CategoriesEcran() {
  const lecture = useCategories();
  return (
    <>
      <h1 className="title-1">Catégories</h1>
      <AvecCategories lecture={lecture}>
        {(categories) =>
          categories.length === 0 ? (
            <p>Aucune catégorie.</p>
          ) : (
            <ul className="ivt-stack" style={LISTE} aria-label="Catégories">
              {trierCategories(categories).map((categorie) => (
                <li key={categorie.id}>
                  <Link className="ivt-bottle" to={cheminCategorie(categorie.id)}>
                    <div>
                      <h2 className="ivt-bottle__title">{nomCategorie(categorie)}</h2>
                      <p className="ivt-bottle__meta">{resume(categorie)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </AvecCategories>
      <div className="ivt-row" style={{ padding: 0 }}>
        <LienBouton vers={CHEMINS.nouvelleCategorie}>Nouvelle catégorie</LienBouton>
      </div>
    </>
  );
}

/** Liste déroulante native des types, avec erreur reliée comme pour `Field`. */
function ChoixType({ valeur, erreur, onChange }: { valeur: string; erreur?: string; onChange: (type: string) => void }) {
  const id = useId();
  return (
    <div className="ivt-field">
      <label className="ivt-field__label" htmlFor={id}>
        Type
      </label>
      <select
        id={id}
        className={cx('ivt-input', erreur && 'ivt-input--error')}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${id}-erreur` : undefined}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choisir un type</option>
        {WINE_TYPES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {erreur && (
        <p className="ivt-field__error" id={`${id}-erreur`}>
          {erreur}
        </p>
      )}
    </div>
  );
}

type ChampNombre = 'seuil' | 'garde';

/** Seuil et durée de garde, communs à la création et à la modification. */
function ChampsNombres({
  valeurs,
  erreurs,
  onChange,
}: {
  valeurs: Record<ChampNombre, string>;
  erreurs: Partial<Record<string, string>>;
  onChange: (champ: ChampNombre, valeur: string) => void;
}) {
  return (
    <>
      <Field
        libelle="Seuil minimum (facultatif)"
        aide={AIDES.seuil}
        inputMode="numeric"
        erreur={erreurs.seuil}
        value={valeurs.seuil}
        onChange={(e) => onChange('seuil', e.target.value)}
      />
      <Field
        libelle="Durée de garde en années (facultative)"
        aide={AIDES.garde}
        inputMode="numeric"
        erreur={erreurs.garde}
        value={valeurs.garde}
        onChange={(e) => onChange('garde', e.target.value)}
      />
    </>
  );
}

/** Création d'une catégorie : type, région facultative (générique sans), seuil, garde. */
export function NouvelleCategorie() {
  const { client } = useSession();
  const naviguer = useNavigate();
  const possible = useEnLigne();
  const regions = useReferentiel('regions');
  const idRegions = useId();
  const { enCours, erreur, envoyer } = useEnvoi();
  const { erreurs, verifier, effacer } = useErreurs<'type' | 'region' | ChampNombre>();
  const [type, setType] = useState('');
  const [region, setRegion] = useState('');
  const [nombres, setNombres] = useState<Record<ChampNombre, string>>({ seuil: '', garde: '' });

  const creer = () => {
    const nomRegion = region.trim();
    const trouvees = {
      type: type === '' ? MESSAGES_CATEGORIE.typeManquant : undefined,
      region: verifierRegion(nomRegion),
      seuil: verifierSeuil(nombres.seuil),
      garde: verifierGarde(nombres.garde),
    };
    if (!verifier(trouvees)) return;
    void envoyer(async () => {
      await client.requete('/api/categories', {
        methode: 'POST',
        corps: {
          type: type as WineType,
          ...(nomRegion !== '' && { region: nomRegion }),
          threshold: versNombre(nombres.seuil),
          ageing_years: versNombre(nombres.garde),
        },
      });
      void naviguer(CHEMINS.categories, { replace: true });
    });
  };

  return (
    <>
      <h1 className="title-1">Nouvelle catégorie</h1>
      <AvisReseau />
      <Formulaire onEnvoi={creer}>
        <ChoixType
          valeur={type}
          erreur={erreurs.type}
          onChange={(valeur) => {
            setType(valeur);
            effacer('type');
          }}
        />
        <Field
          libelle="Région (facultative)"
          aide="Sans région : catégorie générique, pour tout le type."
          list={idRegions}
          autoComplete="off"
          erreur={erreurs.region}
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            effacer('region');
          }}
        />
        <datalist id={idRegions}>
          {regions.map((nom) => (
            <option key={nom} value={nom} />
          ))}
        </datalist>
        <ChampsNombres
          valeurs={nombres}
          erreurs={erreurs}
          onChange={(champ, valeur) => {
            setNombres((avant) => ({ ...avant, [champ]: valeur }));
            effacer(champ);
          }}
        />
        {erreur !== null && (
          <Banner variante="danger" titre="Création refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <Button type="submit" variante="primary" bloc disabled={enCours || !possible}>
          Créer la catégorie
        </Button>
      </Formulaire>
    </>
  );
}

/** Modification du seuil et de la durée de garde d'une catégorie, et suppression (en ligne). */
export function CategorieEcran() {
  const id = Number(useParams().id);
  return (
    <AvecCategories lecture={useCategories()}>
      {(categories) => {
        const categorie = categories.find((c) => c.id === id);
        if (categorie === undefined) {
          return <Introuvable titre="Catégorie introuvable" detail="Elle a peut-être été supprimée depuis un autre appareil." />;
        }
        return <CategorieChargee key={categorie.id} categorie={categorie} />;
      }}
    </AvecCategories>
  );
}

function CategorieChargee({ categorie }: { categorie: Categorie }) {
  const { client } = useSession();
  const naviguer = useNavigate();
  const possible = useEnLigne();
  const { enCours, erreur, envoyer } = useEnvoi();
  const { erreurs, verifier, effacer } = useErreurs<ChampNombre>();
  const [nombres, setNombres] = useState<Record<ChampNombre, string>>({
    seuil: categorie.threshold === null ? '' : String(categorie.threshold),
    garde: categorie.ageing_years === null ? '' : String(categorie.ageing_years),
  });
  const retour = () => void naviguer(CHEMINS.categories, { replace: true });

  const enregistrer = () => {
    if (!verifier({ seuil: verifierSeuil(nombres.seuil), garde: verifierGarde(nombres.garde) })) return;
    void envoyer(async () => {
      await client.requete(cheminApi(categorie), {
        methode: 'PATCH',
        corps: { threshold: versNombre(nombres.seuil), ageing_years: versNombre(nombres.garde) },
      });
      retour();
    });
  };

  return (
    <>
      <h1 className="title-1">{nomCategorie(categorie)}</h1>
      <p>{enCave(categorie.count)}</p>
      <AvisReseau />
      <Formulaire onEnvoi={enregistrer}>
        <ChampsNombres
          valeurs={nombres}
          erreurs={erreurs}
          onChange={(champ, valeur) => {
            setNombres((avant) => ({ ...avant, [champ]: valeur }));
            effacer(champ);
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
      <SuppressionCategorie categorie={categorie} possible={possible} onSupprimee={retour} />
    </>
  );
}

const cheminApi = (categorie: Categorie) => `/api/categories/${categorie.id}`;

/** Suppression confirmée dans une feuille basse ; bouton secondaire (« danger » est réservé à Sortir). */
function SuppressionCategorie({
  categorie,
  possible,
  onSupprimee,
}: {
  categorie: Categorie;
  possible: boolean;
  onSupprimee: () => void;
}) {
  const { client } = useSession();
  const [ouverte, setOuverte] = useState(false);
  const { enCours, erreur, envoyer } = useEnvoi();

  const supprimer = () =>
    void envoyer(async () => {
      await client.requete(cheminApi(categorie), { methode: 'DELETE' });
      setOuverte(false);
      onSupprimee();
    });

  return (
    <>
      <Button disabled={!possible} onClick={() => setOuverte(true)}>
        Supprimer la catégorie
      </Button>
      <Sheet titre="Supprimer la catégorie" ouvert={ouverte} onFermer={() => setOuverte(false)}>
        <p>Les dates limites de consommation de ses bouteilles seront recalculées.</p>
        {erreur !== null && (
          <Banner variante="danger" titre="Suppression refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <div className="ivt-row">
          <Button disabled={enCours || !possible} onClick={supprimer}>
            Supprimer
          </Button>
          <Button variante="quiet" onClick={() => setOuverte(false)}>
            Annuler
          </Button>
        </div>
      </Sheet>
    </>
  );
}
