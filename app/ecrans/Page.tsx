import type { FormEvent, ReactNode } from 'react';
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

/** Formulaire sans validation native : les messages viennent du serveur, en français. */
export function Formulaire({ onEnvoi, children }: { onEnvoi: () => void; children: ReactNode }) {
  const soumettre = (evenement: FormEvent) => {
    evenement.preventDefault();
    onEnvoi();
  };

  return (
    <form className="ivt-stack" style={{ padding: 0 }} noValidate onSubmit={soumettre}>
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
