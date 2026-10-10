import { horsRangement, nomEtagere, rangeesDans, rangeesSur } from '../../cave/lecture.ts';
import { CHEMINS, cheminArmoire, cheminCarton } from '../../chemins.ts';
import { AvecCave, LienBouton, LienTexte, ListeBouteilles, Section } from './communs.tsx';
import { RechercheReference } from './RechercheReference.tsx';

const nombreDeBouteilles = (n: number) => `${n} ${n > 1 ? 'bouteilles' : 'bouteille'}`;

/** Vue cave globale (CdC §3.1) : Armoire > Étagère > bouteilles, puis Cartons, puis Hors rangement. */
export function Cave() {
  return (
    <>
      <h1 className="display">Cave</h1>
      <RechercheReference />
      <AvecCave>
        {({ cave, bouteilles }) => (
          <>
            {cave.cabinets.length === 0 && cave.boxes.length === 0 && (
              <p>Aucun emplacement. Ajouter une armoire ou un carton pour commencer.</p>
            )}
            {cave.cabinets.map((armoire) => (
              <Section key={armoire.id} niveau={2} titre={<LienTexte vers={cheminArmoire(armoire.id)}>{armoire.name}</LienTexte>}>
                {armoire.shelves.length === 0 && <p>Aucune étagère.</p>}
                {armoire.shelves.map((etagere) => (
                  <Section key={etagere.id} niveau={3} titre={nomEtagere(etagere)}>
                    <p className="caption">
                      {etagere.occupied} / {etagere.capacity} alvéoles
                    </p>
                    <ListeBouteilles bouteilles={rangeesSur(bouteilles, etagere.id)} />
                  </Section>
                ))}
              </Section>
            ))}
            {cave.boxes.length > 0 && (
              <Section niveau={2} titre="Cartons">
                {cave.boxes.map((carton) => (
                  <Section key={carton.id} niveau={3} titre={<LienTexte vers={cheminCarton(carton.id)}>{carton.label}</LienTexte>}>
                    <p className="caption">
                      {carton.occupied} / {carton.capacity} bouteilles
                    </p>
                    <ListeBouteilles bouteilles={rangeesDans(bouteilles, carton.id)} />
                  </Section>
                ))}
              </Section>
            )}
            {cave.unplaced > 0 && (
              <Section niveau={2} titre="Hors rangement">
                <p className="caption">{nombreDeBouteilles(cave.unplaced)}</p>
                <ListeBouteilles bouteilles={horsRangement(bouteilles)} />
              </Section>
            )}
            <div className="ivt-row" style={{ padding: 0 }}>
              <LienBouton vers={CHEMINS.nouvelleArmoire}>Ajouter une armoire</LienBouton>
              <LienBouton vers={CHEMINS.nouveauCarton}>Ajouter un carton</LienBouton>
            </div>
          </>
        )}
      </AvecCave>
    </>
  );
}
