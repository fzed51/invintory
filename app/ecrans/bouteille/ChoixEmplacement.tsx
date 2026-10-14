import { memeEmplacement, places, type Place } from '../../cave/attente.ts';
import { nomEtagere } from '../../cave/format.ts';
import { libelleEmplacement, rangeesSur } from '../../cave/lecture.ts';
import type { Bouteille, Cave, Emplacement } from '../../cave/types.ts';
import { Armoire } from '../../components/Armoire.tsx';
import { ShelfGrid } from '../../components/ShelfGrid.tsx';
import { cx } from '../../design/wine-types.ts';
import { cible, HORS_RANGEMENT } from './emplacement.ts';

// Choix d'un emplacement de rangement, partagé par Déplacer et l'ajout de bouteilles.

type PropsChoix = {
  cave: Cave;
  bouteilles: Bouteille[];
  /** Emplacement de la bouteille déplacée ; null pour un ajout. */
  actuel: Emplacement | null;
  /** Bouteilles rangées ensemble (ajout en masse) : places trop petites désactivées. */
  quantite?: number;
  proposee: Place | null;
  choix: Emplacement | null;
  onChoisir: (emplacement: Emplacement) => void;
};

/**
 * Choix manuel (CdC §3.2) : les armoires (une étagère = un bouton, complète désactivée), les
 * cartons et Hors rangement. L'emplacement actuel reste visible, sans être choisissable.
 */
export function ChoixManuel({ cave, bouteilles, actuel, quantite = 1, proposee, choix, onChoisir }: PropsChoix) {
  const estChoisi = (e: Emplacement) => choix !== null && memeEmplacement(choix, e);
  const estActuel = (e: Emplacement) => actuel !== null && memeEmplacement(e, actuel);
  const toutes = places(cave);
  const cartons = toutes.filter((p) => p.location.type === 'carton');

  return (
    <div className="ivt-stack" style={{ padding: 0 }}>
      {cave.cabinets
        .filter((armoire) => armoire.shelves.length > 0)
        .map((armoire) => (
          <Armoire key={armoire.id} nom={armoire.name}>
            {armoire.shelves.map((etagere) => {
              const { location } = toutes.find((p) => memeEmplacement(p.location, { type: 'etagere', id: etagere.id }))!;
              const commun = {
                nom: nomEtagere(etagere),
                capacite: etagere.capacity,
                occupation: rangeesSur(bouteilles, etagere.id).map((b) => b.type),
              };
              if (estActuel(location)) return <ShelfGrid key={etagere.id} {...commun} />;
              return (
                <ShelfGrid
                  key={etagere.id}
                  {...commun}
                  besoin={quantite}
                  proposee={proposee !== null && memeEmplacement(proposee.location, location)}
                  selectionnee={estChoisi(location)}
                  onChoisir={() => onChoisir(location)}
                />
              );
            })}
          </Armoire>
        ))}
      {cartons.length > 0 && <p className="body-strong" style={{ margin: 0 }}>Cartons</p>}
      {cartons.map(({ location, capacite, occupees, libres }) => {
        const etat = estActuel(location)
          ? 'emplacement actuel'
          : libres === 0
            ? 'complet'
            : libres < quantite
              ? 'place insuffisante'
              : null;
        const propose = proposee !== null && memeEmplacement(proposee.location, location) ? 'proposé' : null;
        const compte = `${occupees} ${occupees > 1 ? 'bouteilles' : 'bouteille'} sur ${capacite}`;
        return (
          <Choix
            key={JSON.stringify(cible(location))}
            nom={libelleEmplacement(location)}
            detail={[compte, etat ?? propose].filter(Boolean).join(', ')}
            choisi={estChoisi(location)}
            desactive={etat !== null}
            onChoisir={() => onChoisir(location)}
          />
        );
      })}
      {actuel?.type !== 'hors_rangement' && (
        <Choix
          nom="Hors rangement"
          detail={null}
          choisi={estChoisi(HORS_RANGEMENT)}
          desactive={false}
          onChoisir={() => onChoisir(HORS_RANGEMENT)}
        />
      )}
    </div>
  );
}

/** Emplacement sans alvéoles (carton, Hors rangement), à l'apparence d'une étagère choisissable. */
function Choix(props: { nom: string; detail: string | null; choisi: boolean; desactive: boolean; onChoisir: () => void }) {
  const { nom, detail, choisi, desactive, onChoisir } = props;
  return (
    <button
      type="button"
      className={cx('ivt-shelf', choisi && 'ivt-shelf--selected')}
      aria-label={detail === null ? nom : `${nom}, ${detail}`}
      aria-pressed={choisi}
      disabled={desactive}
      onClick={onChoisir}
    >
      <span className="ivt-shelf__head">
        <span className="ivt-shelf__name">{nom}</span>
        {detail !== null && <span className="ivt-shelf__count">{detail}</span>}
      </span>
    </button>
  );
}
