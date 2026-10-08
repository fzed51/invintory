import { Outlet, useLocation } from 'react-router';
import { CHEMINS } from '../chemins.ts';
import { BottomNav, type Onglet } from '../components/BottomNav.tsx';

const ONGLET_PAR_CHEMIN: Record<string, Onglet> = {
  [CHEMINS.cave]: 'cave',
  [CHEMINS.repas]: 'repas',
  [CHEMINS.ajouter]: 'ajouter',
  [CHEMINS.manques]: 'manques',
  [CHEMINS.reglages]: 'reglages',
};

/** Coque des écrans de l'application : contenu, puis barre de navigation collée en bas. */
export function Coque() {
  const { pathname } = useLocation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <main className="ivt-stack" style={{ flex: 1 }}>
        <Outlet />
      </main>
      <div style={{ position: 'sticky', bottom: 0 }}>
        {/* Le nombre de manques arrive avec l'écran Manques (étape 8). */}
        <BottomNav actif={ONGLET_PAR_CHEMIN[pathname] ?? 'cave'} manques={0} />
      </div>
    </div>
  );
}

/** Écran prévu à une étape ultérieure du plan. */
export function AVenir({ titre, accueil = false }: { titre: string; accueil?: boolean }) {
  return (
    <>
      <h1 className={accueil ? 'display' : 'title-1'}>{titre}</h1>
      <p>Cet écran arrive dans une prochaine version.</p>
    </>
  );
}
