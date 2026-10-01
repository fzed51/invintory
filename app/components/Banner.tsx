import type { ReactNode } from 'react';
import { cx } from '../design/wine-types.ts';
import { Icone, type NomIcone } from './Icone.tsx';

type Variante = 'neutre' | 'success' | 'warning' | 'danger';

const ICONE_PAR_DEFAUT: Record<Variante, NomIcone> = {
  neutre: 'info',
  success: 'succes',
  warning: 'alerte',
  danger: 'erreur',
};

type Props = {
  /** neutre (hors ligne, en attente), success, warning (manque), danger (refus bloquant). */
  variante?: Variante;
  titre: string;
  icone?: NomIcone;
  children?: ReactNode;
  actions?: ReactNode;
};

/** Message en ligne : `role="alert"` pour un refus, `role="status"` sinon. */
export function Banner({ variante = 'neutre', titre, icone, children, actions }: Props) {
  return (
    <div
      className={cx('ivt-banner', variante !== 'neutre' && `ivt-banner--${variante}`)}
      role={variante === 'danger' ? 'alert' : 'status'}
    >
      <Icone nom={icone ?? ICONE_PAR_DEFAUT[variante]} />
      <div>
        <span className="ivt-banner__title">{titre}</span>
        {children}
        {actions}
      </div>
    </div>
  );
}
