import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  titre: string;
  ouvert: boolean;
  /** Demande de fermeture (Échap) : le parent décide en repassant `ouvert` à false. */
  onFermer: () => void;
  children?: ReactNode;
};

// Mise en page seule (aucune couleur ni police) : <dialog> natif posé en bas de l'écran,
// texte hérité des jetons ; le fond, le rayon et l'ombre viennent de .ivt-sheet.
const POSITION = {
  margin: 'auto 0 0',
  width: '100%',
  maxWidth: '100%',
  border: 0,
  color: 'var(--ink)',
} as const;

/** Feuille basse modale : confirmation qui demande un choix (ex. Sortir, Déplacer). */
export function Sheet({ titre, ouvert, onFermer, children }: Props) {
  const dialogue = useRef<HTMLDialogElement>(null);
  const idTitre = useId();

  useEffect(() => {
    const element = dialogue.current;
    if (!element) return;
    if (ouvert && !element.open) element.showModal();
    if (!ouvert && element.open) element.close();
  }, [ouvert]);

  return (
    <dialog
      ref={dialogue}
      className="ivt-sheet"
      aria-labelledby={idTitre}
      style={POSITION}
      onCancel={(evenement) => {
        evenement.preventDefault();
        onFermer();
      }}
    >
      <h2 className="title-2" id={idTitre}>
        {titre}
      </h2>
      {children}
    </dialog>
  );
}
