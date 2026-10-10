import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';

/** Écran hors coque (compte) : titre puis contenu. `display` pour l'écran d'accueil (connexion). */
export function Page({ titre, accueil = false, children }: { titre: string; accueil?: boolean; children: ReactNode }) {
  return (
    <main className="ivt-stack">
      <h1 className={accueil ? 'display' : 'title-1'}>{titre}</h1>
      {children}
    </main>
  );
}

/**
 * Formulaire sans validation native : l'écran vérifie la saisie (messages en français, sous
 * les champs) ; après chaque envoi, le premier champ en erreur reçoit le focus.
 */
export function Formulaire({ onEnvoi, children }: { onEnvoi: () => void; children: ReactNode }) {
  const formulaire = useRef<HTMLFormElement>(null);
  const [envois, setEnvois] = useState(0);

  useEffect(() => {
    if (envois > 0) formulaire.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [envois]);

  const soumettre = (evenement: FormEvent) => {
    evenement.preventDefault();
    onEnvoi();
    setEnvois((n) => n + 1);
  };

  return (
    <form ref={formulaire} className="ivt-stack" style={{ padding: 0 }} noValidate onSubmit={soumettre}>
      {children}
    </form>
  );
}

/** Lien d'action secondaire, à l'apparence d'un bouton discret. */
export function LienDiscret({ vers, children }: { vers: string; children: ReactNode }) {
  return (
    <Link className="ivt-btn ivt-btn--quiet" to={vers}>
      {children}
    </Link>
  );
}
