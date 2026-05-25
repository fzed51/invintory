import { Suspense, type PropsWithChildren } from "react";
import { Link } from "react-router-dom";

export function DefaultLayout({children}: PropsWithChildren) {
  return <>
      <nav style={{ marginBottom: 24 }}>
        <Link to="/">Accueil</Link>
      </nav>
      <Suspense fallback={<div>Chargement...</div>}>
        {children}
      </Suspense>
    </>;
}