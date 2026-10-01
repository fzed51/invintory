import { cx, type WineType } from '../design/wine-types.ts';
import { BadgeSouvenir, BadgeType, BadgeUrgent } from './Badge.tsx';

export type BottleCardProps = {
  /** Adresse de la fiche bouteille. */
  href: string;
  domaine: string | null;
  region: string | null;
  cepage: string | null;
  millesime: number | null;
  type: WineType;
  /** Emplacement lisible, ex. « Armoire de la cuisine › Étagère 2 ». */
  emplacement: string;
  /** Code court ; null tant qu'il n'est pas attribué. */
  reference: string | null;
  souvenir?: boolean;
  urgent?: boolean;
  selectionnee?: boolean;
};

/** Ligne de liste qui ouvre la fiche d'une bouteille. */
export function BottleCard({
  href,
  domaine,
  region,
  cepage,
  millesime,
  type,
  emplacement,
  reference,
  souvenir = false,
  urgent = false,
  selectionnee = false,
}: BottleCardProps) {
  const meta = [region, cepage, millesime === null ? 'non millésimé' : String(millesime)]
    .filter((partie) => partie !== null && partie !== '')
    .join(' · ');

  return (
    <a className={cx('ivt-bottle', selectionnee && 'ivt-bottle--selected')} href={href}>
      <div>
        <h3 className="ivt-bottle__title">{domaine ?? 'Domaine non renseigné'}</h3>
        <p className="ivt-bottle__meta">{meta}</p>
        <div className="ivt-bottle__badges">
          <BadgeType type={type} />
          {souvenir && <BadgeSouvenir />}
          {urgent && <BadgeUrgent />}
        </div>
        <p className="ivt-bottle__where">{emplacement}</p>
      </div>
      {reference !== null && <span className="ivt-ref">{reference.toLowerCase()}</span>}
    </a>
  );
}
