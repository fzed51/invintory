import { useState, type ReactNode } from 'react';
import { BadgeSouvenir, BadgeType, BadgeUrgent, Pastille } from '../components/Badge.tsx';
import { Armoire } from '../components/Armoire.tsx';
import { Banner } from '../components/Banner.tsx';
import { BottleCard } from '../components/BottleCard.tsx';
import { BottomNav } from '../components/BottomNav.tsx';
import { Button } from '../components/Button.tsx';
import { Field } from '../components/Field.tsx';
import { ICONES, Icone, type NomIcone } from '../components/Icone.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { ShelfGrid } from '../components/ShelfGrid.tsx';
import { WINE_TYPES, type WineType } from '../design/wine-types.ts';

// Page de développement uniquement (chargée par main.tsx si import.meta.env.DEV) :
// chaque composant dans ses états, pour un contrôle visuel en thème clair et sombre.

type Theme = 'light' | 'dark';

const NEUF: WineType[] = ['rouge', 'rouge', 'blanc', 'rouge', 'rose', 'blanc', 'effervescent', 'doux', 'autre'];
const PLEINE: WineType[] = Array.from({ length: 6 }, () => 'rouge');
const QUATRE: WineType[] = ['blanc', 'effervescent', 'doux', 'rose'];

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="ivt-stack" aria-label={titre}>
      <h2 className="title-1">{titre}</h2>
      {children}
    </section>
  );
}

export function Catalogue() {
  const [theme, setTheme] = useState<Theme>(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [tri, setTri] = useState<'priorite' | 'age'>('priorite');
  const [etagere, setEtagere] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [feuille, setFeuille] = useState(false);

  const changerTheme = (valeur: Theme) => {
    document.documentElement.dataset.theme = valeur;
    setTheme(valeur);
  };

  return (
    <main className="ivt-stack">
      <h1 className="display">Catalogue des composants</h1>
      <SegmentedControl
        libelle="Thème"
        options={[
          { valeur: 'light', libelle: 'Clair' },
          { valeur: 'dark', libelle: 'Sombre' },
        ]}
        valeur={theme}
        onChange={changerTheme}
      />

      <Section titre="Button">
        <div className="ivt-row">
          <Button variante="primary">Ajouter</Button>
          <Button>Déplacer</Button>
          <Button variante="danger">Sortir</Button>
          <Button variante="quiet">Autre emplacement</Button>
          <Button disabled>Enregistrer</Button>
        </div>
        <Button variante="primary" bloc>
          Choisir manuellement
        </Button>
      </Section>

      <Section titre="Badge">
        <div className="ivt-row">
          {WINE_TYPES.map((w) => (
            <BadgeType key={w.id} type={w.id} />
          ))}
        </div>
        <div className="ivt-row">
          <BadgeSouvenir />
          <BadgeUrgent />
          <Pastille nombre={3} libelle="3 catégories en manque" />
        </div>
      </Section>

      <Section titre="BottleCard">
        <BottleCard
          href="#k7"
          domaine="Domaine Delaunay"
          region="Pommard"
          cepage="Pinot noir"
          millesime={2016}
          type="rouge"
          emplacement="Armoire de la cuisine › Étagère 2"
          reference="k7"
          urgent
        />
        <BottleCard
          href="#b2"
          domaine="Maison Pierrel"
          region="Champagne"
          cepage="Chardonnay"
          millesime={null}
          type="effervescent"
          emplacement="Carton du garage"
          reference="b2"
          souvenir
          selectionnee
        />
      </Section>

      <Section titre="ShelfGrid">
        <Armoire nom="Armoire de la cuisine">
          <ShelfGrid nom="Étagère 1" capacite={6} occupation={PLEINE} onChoisir={() => setEtagere('1')} />
          <ShelfGrid
            nom="Étagère 2"
            capacite={12}
            occupation={NEUF}
            proposee
            selectionnee={etagere === '2'}
            onChoisir={() => setEtagere('2')}
          />
          <ShelfGrid
            nom="Étagère 3"
            capacite={20}
            occupation={QUATRE}
            selectionnee={etagere === '3'}
            onChoisir={() => setEtagere('3')}
          />
        </Armoire>
        <ShelfGrid nom="Étagère en consultation" capacite={12} occupation={NEUF} />
      </Section>

      <Section titre="Field">
        <Field
          libelle="Référence"
          reference
          aide="Le code écrit sur l'étiquette de la bouteille."
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <Field
          libelle="Nombre de bouteilles"
          inputMode="numeric"
          defaultValue="14"
          erreur="Capacité dépassée : 12 alvéoles au maximum."
        />
      </Section>

      <Section titre="SegmentedControl">
        <SegmentedControl
          libelle="Trier par"
          options={[
            { valeur: 'priorite', libelle: 'À boire en priorité' },
            { valeur: 'age', libelle: 'Par âge' },
          ]}
          valeur={tri}
          onChange={setTri}
        />
      </Section>

      <Section titre="Banner">
        <Banner titre="Hors ligne" icone="hors-ligne">
          3 mouvements en attente de synchronisation.
        </Banner>
        <Banner variante="success" titre="Synchronisé">
          Vos derniers mouvements sont enregistrés.
        </Banner>
        <Banner variante="warning" titre="Blanc sec sous son seuil">
          Il manque 2 bouteilles pour atteindre 6.
        </Banner>
        <Banner variante="danger" titre="Étagère complète">
          12 alvéoles sur 12 sont occupées : choisissez un autre emplacement.
        </Banner>
      </Section>

      <Section titre="Sheet">
        <Button onClick={() => setFeuille(true)}>Sortir la bouteille</Button>
        <Sheet titre="Sortir la bouteille" ouvert={feuille} onFermer={() => setFeuille(false)}>
          <p>La sortie est définitive. Choisir le motif.</p>
          <div className="ivt-stack">
            <Button variante="danger" bloc onClick={() => setFeuille(false)}>
              Sortir
            </Button>
            <Button variante="quiet" bloc onClick={() => setFeuille(false)}>
              Annuler
            </Button>
          </div>
        </Sheet>
      </Section>

      <Section titre="Icônes">
        <div className="ivt-row">
          {(Object.keys(ICONES) as NomIcone[]).map((nom) => (
            <span key={nom} className="caption">
              <Icone nom={nom} /> {nom}
            </span>
          ))}
        </div>
      </Section>

      <Section titre="BottomNav">
        <BottomNav actif="cave" manques={3} />
      </Section>
    </main>
  );
}
