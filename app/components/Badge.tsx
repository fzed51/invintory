import { cx, wineType, type WineType } from '../design/wine-types.ts';
import { Icone } from './Icone.tsx';

/** Badge de type : pastille colorée et libellé, jamais la couleur seule. */
export function BadgeType({ type }: { type: WineType }) {
  const info = wineType(type);

  return (
    <span className={cx('ivt-badge', info.badgeClass)}>
      <span className="ivt-badge__dot" />
      {info.label}
    </span>
  );
}

/** Bouteille conservée sans intention de consommation programmée. */
export function BadgeSouvenir() {
  return (
    <span className="ivt-badge ivt-badge--souvenir">
      <Icone nom="souvenir" taille="sm" />
      Souvenir
    </span>
  );
}

/** Date limite de consommation dépassée ; seul badge plein. */
export function BadgeUrgent() {
  return (
    <span className="ivt-badge ivt-badge--urgent">
      <Icone nom="erreur" taille="sm" />
      À boire d'urgence
    </span>
  );
}

type PastilleProps = {
  nombre: number;
  /** Lu par les lecteurs d'écran à la place du nombre seul, ex. « 3 catégories en manque ». */
  libelle: string;
  className?: string;
};

/** Pastille de compteur ; absente quand le compteur est nul. */
export function Pastille({ nombre, libelle, className }: PastilleProps) {
  if (nombre <= 0) return null;

  return (
    <span className={cx('ivt-pastille', className)} aria-label={libelle}>
      {nombre}
    </span>
  );
}
