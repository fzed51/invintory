import { Outlet, useLocation } from 'react-router';
import { useManques } from '../categories/lecture.ts';
import { CHEMINS } from '../chemins.ts';
import { BottomNav, type Onglet } from '../components/BottomNav.tsx';
import { BandeauSynchro } from '../hors-ligne/BandeauSynchro.tsx';

const ONGLET_PAR_CHEMIN: Record<string, Onglet> = {
  [CHEMINS.cave]: 'cave',
  [CHEMINS.repas]: 'repas',
  [CHEMINS.ajouter]: 'ajouter',
  [CHEMINS.manques]: 'manques',
  [CHEMINS.reglages]: 'reglages',
  [CHEMINS.changerEmail]: 'reglages',
};

/** Coque des écrans de l'application : contenu, puis barre de navigation collée en bas. */
export function Coque() {
  const { pathname } = useLocation();
  const manques = useManques(pathname);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <main className="ivt-stack" style={{ flex: 1 }}>
        <BandeauSynchro />
        <Outlet context={manques} />
      </main>
      <div style={{ position: 'sticky', bottom: 0 }}>
        <BottomNav
          actif={ONGLET_PAR_CHEMIN[pathname] ?? 'cave'}
          manques={manques.etat === 'pret' ? manques.donnees.length : 0}
        />
      </div>
    </div>
  );
}
