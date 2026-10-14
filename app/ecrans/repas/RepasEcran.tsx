import { useId } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/Button.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { WINE_TYPES, type WineType } from '../../design/wine-types.ts';
import { AUCUN_FILTRE, filtrerRepas, optionsRepas, trierRepas, type FiltresRepas, type TriRepas } from '../../repas/repas.ts';
import { AvecCave, ListeBouteilles } from '../cave/communs.tsx';

const TRIS = [
  { valeur: 'priorite', libelle: 'À boire en priorité' },
  { valeur: 'age', libelle: 'Par âge' },
] as const;

const nombreDeBouteilles = (n: number) => `${n} ${n > 1 ? 'bouteilles' : 'bouteille'}`;

/** Filtres et tri lus dans l'adresse (`?type=rouge&region=…&grape=…&sort=age`). */
function lireAdresse(parametres: URLSearchParams): { filtres: FiltresRepas; tri: TriRepas } {
  const type = parametres.get('type');
  return {
    filtres: {
      type: WINE_TYPES.some((t) => t.id === type) ? (type as WineType) : null,
      region: parametres.get('region') || null,
      cepage: parametres.get('grape') || null,
    },
    tri: parametres.get('sort') === 'age' ? 'age' : 'priorite',
  };
}

function versAdresse(filtres: FiltresRepas, tri: TriRepas): URLSearchParams {
  const parametres = new URLSearchParams();
  if (filtres.type !== null) parametres.set('type', filtres.type);
  if (filtres.region !== null) parametres.set('region', filtres.region);
  if (filtres.cepage !== null) parametres.set('grape', filtres.cepage);
  if (tri === 'age') parametres.set('sort', 'age');
  return parametres;
}

/** Liste déroulante native ; la valeur vide est « tous ». */
function Choix({
  libelle,
  tous,
  options,
  valeur,
  onChange,
}: {
  libelle: string;
  tous: string;
  options: readonly { valeur: string; libelle: string }[];
  valeur: string | null;
  onChange: (valeur: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="ivt-field">
      <label className="ivt-field__label" htmlFor={id}>
        {libelle}
      </label>
      <select id={id} className="ivt-input" value={valeur ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{tous}</option>
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}

const enOptions = (noms: string[]) => noms.map((nom) => ({ valeur: nom, libelle: nom }));

/**
 * Recherche pour un repas (CdC §3.6) : filtres type, région, cépage ; tris « À boire en
 * priorité » et « Par âge ». Calculée sur la cave lue (copie locale hors ligne), filtres et
 * tri gardés dans l'adresse pour les retrouver en revenant d'une fiche.
 */
export function RepasEcran() {
  const [parametres, setParametres] = useSearchParams();
  const { filtres, tri } = lireAdresse(parametres);
  const changer = (nouveaux: FiltresRepas, nouveauTri: TriRepas) =>
    setParametres(versAdresse(nouveaux, nouveauTri), { replace: true });

  return (
    <>
      <h1 className="title-1">Repas</h1>
      <AvecCave>
        {({ bouteilles }) => {
          if (filtrerRepas(bouteilles, AUCUN_FILTRE).length === 0) return <p>Aucune bouteille en cave.</p>;
          const { regions, cepages } = optionsRepas(bouteilles);
          const resultats = trierRepas(filtrerRepas(bouteilles, filtres), tri);
          return (
            <>
              <Choix
                libelle="Type"
                tous="Tous les types"
                options={WINE_TYPES.map((t) => ({ valeur: t.id, libelle: t.label }))}
                valeur={filtres.type}
                onChange={(type) => changer({ ...filtres, type: type as WineType | null }, tri)}
              />
              <Choix
                libelle="Région"
                tous="Toutes les régions"
                options={enOptions(regions)}
                valeur={filtres.region}
                onChange={(region) => changer({ ...filtres, region }, tri)}
              />
              <Choix
                libelle="Cépage"
                tous="Tous les cépages"
                options={enOptions(cepages)}
                valeur={filtres.cepage}
                onChange={(cepage) => changer({ ...filtres, cepage }, tri)}
              />
              <SegmentedControl
                libelle="Trier par"
                options={TRIS}
                valeur={tri}
                onChange={(nouveauTri) => changer(filtres, nouveauTri)}
              />
              {resultats.length === 0 ? (
                <>
                  <p>Aucune bouteille ne correspond à ces filtres.</p>
                  <div className="ivt-row" style={{ padding: 0 }}>
                    <Button onClick={() => changer(AUCUN_FILTRE, tri)}>Effacer les filtres</Button>
                  </div>
                </>
              ) : (
                <>
                  <p>{nombreDeBouteilles(resultats.length)}</p>
                  <ListeBouteilles bouteilles={resultats} />
                </>
              )}
            </>
          );
        }}
      </AvecCave>
    </>
  );
}
