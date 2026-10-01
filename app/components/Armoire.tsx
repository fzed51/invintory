import type { ReactNode } from 'react';

type Props = {
  nom: string;
  /** Les étagères (ShelfGrid), de haut en bas : une ligne chacune. */
  children?: ReactNode;
};

/** Vue visuelle d'une armoire : ses étagères empilées, et la légende des alvéoles. */
export function Armoire({ nom, children }: Props) {
  return (
    <section className="ivt-armoire" aria-label={nom}>
      <h2 className="ivt-armoire__name">{nom}</h2>
      {children}
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
