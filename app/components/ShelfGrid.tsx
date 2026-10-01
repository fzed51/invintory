import { cx, wineType, type WineType } from '../design/wine-types.ts';

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
  /** Signale la première alvéole libre comme emplacement proposé. */
  proposee?: boolean;
  /** Index de l'alvéole sélectionnée. */
  selectionnee?: number | null;
  /** Choix d'une alvéole libre (rangement dans cette étagère). Sans lui, les libres sont inactives. */
  onChoisir?: (index: number) => void;
  /** Ouverture d'une alvéole occupée. Sans lui, les occupées sont inactives. */
  onOuvrir?: (index: number) => void;
};

/** Étagère vue de face : une alvéole ronde par place. */
export function ShelfGrid({ nom, capacite, occupation, proposee = false, selectionnee = null, onChoisir, onOuvrir }: Props) {
  const occupees = occupation.length;
  // Une capacité réduite sous l'occupation garde toutes les bouteilles visibles.
  const total = Math.max(capacite, occupees);
  const indexPropose = proposee && occupees < capacite ? occupees : -1;

  return (
    <section className="ivt-shelf" aria-label={nom}>
      <div className="ivt-shelf__head">
        <h3 className="ivt-shelf__name">{nom}</h3>
        <span className="ivt-shelf__count">
          {occupees} / {capacite} alvéoles
        </span>
      </div>
      <div className="ivt-shelf__grid">
        {Array.from({ length: total }, (_, index) => {
          const type = occupation[index];
          const numero = `Alvéole ${index + 1}`;

          if (type !== undefined) {
            return (
              <button
                key={index}
                type="button"
                className="ivt-alveole"
                data-wine={type}
                aria-label={`${numero} : ${wineType(type).label}`}
                disabled={onOuvrir === undefined}
                onClick={() => onOuvrir?.(index)}
              />
            );
          }

          const estProposee = index === indexPropose;
          const estSelectionnee = index === selectionnee;
          return (
            <button
              key={index}
              type="button"
              className={cx(
                'ivt-alveole',
                estProposee && 'ivt-alveole--suggested',
                estSelectionnee && 'ivt-alveole--selected',
              )}
              aria-label={`${numero} : ${estProposee ? 'emplacement proposé' : 'libre'}`}
              aria-pressed={selectionnee === null || onChoisir === undefined ? undefined : estSelectionnee}
              disabled={onChoisir === undefined}
              onClick={() => onChoisir?.(index)}
            />
          );
        })}
      </div>
      <ul className="ivt-legend">
        <li>
          <i />
          Libre
        </li>
        <li>
          <i className="is-full" />
          Occupée
        </li>
        <li>
          <i className="is-suggested" />
          Proposée
        </li>
      </ul>
    </section>
  );
}
