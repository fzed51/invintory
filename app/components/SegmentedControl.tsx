import { useRef, type KeyboardEvent } from 'react';

type Option<V extends string> = { valeur: V; libelle: string };

type Props<V extends string> = {
  /** Nom du groupe, ex. « Trier par ». */
  libelle: string;
  /** Deux à trois options courtes. */
  options: readonly Option<V>[];
  valeur: V;
  onChange: (valeur: V) => void;
};

/** Choix exclusif (groupe radio) : un seul arrêt de tabulation, flèches pour changer. */
export function SegmentedControl<V extends string>({ libelle, options, valeur, onChange }: Props<V>) {
  const boutons = useRef<Array<HTMLButtonElement | null>>([]);

  const choisir = (index: number) => {
    const cible = (index + options.length) % options.length;
    onChange(options[cible].valeur);
    boutons.current[cible]?.focus();
  };

  const touche = (evenement: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const deplacements: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: options.length - 1,
    };
    const cible = deplacements[evenement.key];
    if (cible === undefined) return;
    evenement.preventDefault();
    choisir(cible);
  };

  return (
    <div className="ivt-seg" role="radiogroup" aria-label={libelle}>
      {options.map((option, index) => {
        const coche = option.valeur === valeur;
        return (
          <button
            key={option.valeur}
            ref={(element) => {
              boutons.current[index] = element;
            }}
            type="button"
            className="ivt-seg__opt"
            role="radio"
            aria-checked={coche}
            tabIndex={coche ? 0 : -1}
            onClick={() => onChange(option.valeur)}
            onKeyDown={(evenement) => touche(evenement, index)}
          >
            {option.libelle}
          </button>
        );
      })}
    </div>
  );
}
