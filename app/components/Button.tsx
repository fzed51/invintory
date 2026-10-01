import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../design/wine-types.ts';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary : au plus une par écran ; danger : uniquement Sortir (irréversible). */
  variante?: 'primary' | 'secondary' | 'danger' | 'quiet';
  /** Pleine largeur. */
  bloc?: boolean;
};

/** Bouton du design system ; le libellé est un verbe à l'infinitif. */
export function Button({ variante = 'secondary', bloc = false, type = 'button', className, ...attributs }: Props) {
  return (
    <button
      type={type}
      className={cx('ivt-btn', `ivt-btn--${variante}`, bloc && 'ivt-btn--block', className)}
      {...attributs}
    />
  );
}
