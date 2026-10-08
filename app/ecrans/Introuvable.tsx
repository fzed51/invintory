import { CHEMINS } from '../chemins.ts';
import { LienDiscret, Page } from './Page.tsx';

export function Introuvable() {
  return (
    <Page titre="Page introuvable">
      <p>Cette adresse ne correspond à aucun écran.</p>
      <LienDiscret vers={CHEMINS.cave}>Revenir à la cave</LienDiscret>
    </Page>
  );
}
