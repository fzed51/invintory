import type { ReactNode } from 'react';

type Variante = 'info' | 'success' | 'danger';

const CLASSES: Record<Variante, string> = {
  info: 'ivt-banner',
  success: 'ivt-banner ivt-banner--success',
  danger: 'ivt-banner ivt-banner--danger',
};

const ICONES: Record<Variante, ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 3 3 5-6" />
    </>
  ),
  danger: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
};

type Props = {
  variante?: Variante;
  titre: string;
  children?: ReactNode;
  actions?: ReactNode;
};

/** Message en ligne : `role="alert"` pour une erreur, `role="status"` sinon (design système, Banner). */
export function Banner({ variante = 'info', titre, children, actions }: Props) {
  return (
    <div className={CLASSES[variante]} role={variante === 'danger' ? 'alert' : 'status'}>
      <svg className="ivt-icon" viewBox="0 0 24 24" aria-hidden="true">
        {ICONES[variante]}
      </svg>
      <div>
        <span className="ivt-banner__title">{titre}</span>
        {children}
        {actions}
      </div>
    </div>
  );
}
