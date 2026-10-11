import { horsRangement } from '../../cave/lecture.ts';
import { Deplacer } from '../bouteille/Deplacer.tsx';
import { Sortir } from '../bouteille/Sortir.tsx';
import { AvecCave, ListeBouteilles } from './communs.tsx';

/**
 * Vue Hors rangement (CdC §3.5) : les bouteilles sorties de leur rangement (repas…), avec
 * les actions directes Déplacer (vers le rangement définitif) et Sortir.
 */
export function HorsRangementEcran() {
  return (
    <>
      <h1 className="title-1">Hors rangement</h1>
      <AvecCave>
        {({ cave, bouteilles }) => (
          <ListeBouteilles
            bouteilles={horsRangement(bouteilles)}
            vide="Aucune bouteille hors rangement."
            actions={(bouteille) => (
              <>
                <Deplacer bouteille={bouteille} cave={cave} bouteilles={bouteilles} />
                <Sortir bouteille={bouteille} />
              </>
            )}
          />
        )}
      </AvecCave>
    </>
  );
}
