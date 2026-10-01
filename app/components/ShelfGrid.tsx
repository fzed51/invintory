import { cx, type WineType } from '../design/wine-types.ts';

type Props = {
  /** Nom affiché de l'étagère, ex. « Étagère 2 ». */
  nom: string;
  /** Nombre d'alvéoles (capacité bloquante). */
  capacite: number;
  /**
   * Types des bouteilles rangées. Le schéma ne connaît pas la position d'une bouteille
   * dans l'étagère : les alvéoles occupées sont dessinées d'abord, puis les libres.
   */
  occupation: readonly WineType[];
  /** Étagère proposée : sa première alvéole libre est signalée. */
  proposee?: boolean;
  selectionnee?: boolean;
  /** Choix de l'étagère (rangement). Sans lui, l'étagère est en consultation seule. */
  onChoisir?: () => void;
};

/**
 * Une étagère vue de face, sur une seule ligne. On range dans une étagère, pas dans une
 * alvéole précise : quand on peut choisir, l'étagère entière est la cible tactile et ses
 * alvéoles ne sont qu'un dessin de son occupation.
 */
export function ShelfGrid({ nom, capacite, occupation, proposee = false, selectionnee = false, onChoisir }: Props) {
  const occupees = occupation.length;
  const complete = occupees >= capacite;
  const indexPropose = proposee && !complete ? occupees : -1;
  // Une capacité réduite sous l'occupation garde toutes les bouteilles visibles.
  const total = Math.max(capacite, occupees);

  const grille = (
    <span className="ivt-shelf__grid" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cx('ivt-alveole', index === indexPropose && 'ivt-alveole--suggested')}
          data-wine={occupation[index]}
        />
      ))}
    </span>
  );
  const compteur = `${occupees} / ${capacite} alvéoles`;

  if (onChoisir === undefined) {
    return (
      <div className="ivt-shelf">
        <div className="ivt-shelf__head">
          <h3 className="ivt-shelf__name">{nom}</h3>
          <span className="ivt-shelf__count">{compteur}</span>
        </div>
        {grille}
      </div>
    );
  }

  const libelle = [
    nom,
    `${occupees} ${occupees > 1 ? 'alvéoles occupées' : 'alvéole occupée'} sur ${capacite}`,
    complete ? 'complète' : proposee ? 'emplacement proposé' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      className={cx('ivt-shelf', selectionnee && 'ivt-shelf--selected')}
      aria-label={libelle}
      aria-pressed={selectionnee}
      disabled={complete}
      onClick={onChoisir}
    >
      <span className="ivt-shelf__head">
        <span className="ivt-shelf__name">{nom}</span>
        <span className="ivt-shelf__count">{complete ? `${compteur}, complète` : compteur}</span>
      </span>
      {grille}
    </button>
  );
}
