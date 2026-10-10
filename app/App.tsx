import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { CHEMINS } from './chemins.ts';
import { Banner } from './components/Banner.tsx';
import { FicheEcran } from './ecrans/bouteille/FicheEcran.tsx';
import { ModifierFiche } from './ecrans/bouteille/ModifierFiche.tsx';
import { ArmoireEcran } from './ecrans/cave/ArmoireEcran.tsx';
import { CartonEcran, NouveauCarton } from './ecrans/cave/CartonEcran.tsx';
import { Cave } from './ecrans/cave/Cave.tsx';
import { EtagereEcran } from './ecrans/cave/EtagereEcran.tsx';
import { NouvelleArmoire } from './ecrans/cave/NouvelleArmoire.tsx';
import { AVenir, Coque } from './ecrans/Coque.tsx';
import { Connexion } from './ecrans/Connexion.tsx';
import { Inscription } from './ecrans/Inscription.tsx';
import { Introuvable } from './ecrans/Introuvable.tsx';
import { MotDePasseOublie } from './ecrans/MotDePasseOublie.tsx';
import { NouveauMotDePasse } from './ecrans/NouveauMotDePasse.tsx';
import { RetourAuth } from './ecrans/RetourAuth.tsx';
import { HorsLigneProvider } from './hors-ligne/HorsLigneProvider.tsx';
import { PwaBanner } from './PwaBanner.tsx';
import type { ClientApi } from './session/clientApi.ts';
import { useSession } from './session/contexte.ts';
import { SessionProvider } from './session/SessionProvider.tsx';

/** Adresse demandée avant le passage par la connexion. */
type EtatNavigation = { depuis?: string } | null;

function Verification() {
  return (
    <main className="ivt-stack">
      <Banner titre="Ouverture de la session" />
    </main>
  );
}

/** Écrans de l'application : session requise (ou présumée, serveur injoignable). */
function Protegee() {
  const { etat, compte } = useSession();
  const { pathname, search } = useLocation();

  if (etat === 'verification') return <Verification />;
  if (etat === 'deconnectee') {
    return <Navigate to={CHEMINS.connexion} replace state={{ depuis: pathname + search } satisfies EtatNavigation} />;
  }
  if (compte === null) return <Coque />;
  return (
    <HorsLigneProvider key={compte} compte={compte}>
      <Coque />
    </HorsLigneProvider>
  );
}

/** Connexion, inscription, oubli : connecté, on repart vers l'écran demandé au départ. */
function Invite() {
  const { etat } = useSession();
  const etatNavigation = useLocation().state as EtatNavigation;

  if (etat === 'verification') return <Verification />;
  if (etat === 'connectee') return <Navigate to={etatNavigation?.depuis ?? CHEMINS.cave} replace />;
  return <Outlet />;
}

export function App({ client }: { client: ClientApi }) {
  return (
    <SessionProvider client={client}>
      <PwaBanner />
      <Routes>
        <Route element={<Protegee />}>
          <Route path={CHEMINS.cave} element={<Cave />} />
          <Route path={CHEMINS.nouvelleArmoire} element={<NouvelleArmoire />} />
          <Route path={CHEMINS.armoire} element={<ArmoireEcran />} />
          <Route path={CHEMINS.etagere} element={<EtagereEcran />} />
          <Route path={CHEMINS.nouveauCarton} element={<NouveauCarton />} />
          <Route path={CHEMINS.carton} element={<CartonEcran />} />
          <Route path={CHEMINS.bouteille} element={<FicheEcran />} />
          <Route path={CHEMINS.modifierBouteille} element={<ModifierFiche />} />
          <Route path={CHEMINS.repas} element={<AVenir titre="Repas" />} />
          <Route path={CHEMINS.ajouter} element={<AVenir titre="Ajouter une bouteille" />} />
          <Route path={CHEMINS.manques} element={<AVenir titre="Manques" />} />
          <Route path={CHEMINS.reglages} element={<AVenir titre="Réglages" />} />
        </Route>
        <Route element={<Invite />}>
          <Route path={CHEMINS.connexion} element={<Connexion />} />
          <Route path={CHEMINS.inscription} element={<Inscription />} />
          <Route path={CHEMINS.oubli} element={<MotDePasseOublie />} />
        </Route>
        <Route path={CHEMINS.nouveauMotDePasse} element={<NouveauMotDePasse />} />
        <Route path={CHEMINS.retour} element={<RetourAuth />} />
        <Route path="*" element={<Introuvable />} />
      </Routes>
    </SessionProvider>
  );
}
