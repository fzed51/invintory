import type { ReactNode } from 'react';
import { cx } from '../design/wine-types.ts';

/**
 * Jeu d'icônes du design system (tracés de docs/invintory-design-system.html), plus « info ».
 * Placeholder assumé : remplaçable par une bibliothèque au même trait sans toucher aux composants.
 */
export const ICONES = {
  /** Grille d'alvéoles : onglet Cave. */
  cave: (
    <>
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="16" cy="8" r="3.5" />
      <circle cx="8" cy="16" r="3.5" />
      <circle cx="16" cy="16" r="3.5" />
    </>
  ),
  /** Loupe : onglet Repas, recherche. */
  recherche: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l5 5" />
    </>
  ),
  /** Plus : Ajouter. */
  ajouter: <path d="M12 5v14M5 12h14" />,
  /** Triangle d'alerte : onglet Manques, bannière de manque. */
  alerte: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.01" />
    </>
  ),
  /** Curseurs : onglet Réglages. */
  reglages: (
    <>
      <path d="M4 8h16M4 16h16" />
      <circle cx="9" cy="8" r="2" />
      <circle cx="15" cy="16" r="2" />
    </>
  ),
  /** Cercle barré : hors ligne. */
  'hors-ligne': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </>
  ),
  /** Coche : succès, synchronisé. */
  succes: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </>
  ),
  /** Cercle et point d'exclamation : erreur, refus, urgence. */
  erreur: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.01" />
    </>
  ),
  /** Marque-page : souvenir. */
  souvenir: <path d="M7 4h10v16l-5-4-5 4z" />,
  /** Cercle et « i » : information neutre (hors du jeu du design system). */
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NomIcone = keyof typeof ICONES;

type Props = {
  nom: NomIcone;
  /** 24 px par défaut ; « sm » (16 px) dans un badge ou un message. */
  taille?: 'md' | 'sm';
};

/** Icône SVG inline, décorative : le sens est toujours porté par un texte voisin. */
export function Icone({ nom, taille = 'md' }: Props) {
  return (
    <svg
      className={cx('ivt-icon', taille === 'sm' && 'ivt-icon--sm')}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {ICONES[nom]}
    </svg>
  );
}
