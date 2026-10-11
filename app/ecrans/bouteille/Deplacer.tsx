import { useState } from 'react';
import { memeEmplacement, places, suggestion, messageComplet, type Place } from '../../cave/attente.ts';
import { nomEtagere } from '../../cave/format.ts';
import { libelleEmplacement, rangeesSur } from '../../cave/lecture.ts';
import type { Bouteille, Cave, Emplacement } from '../../cave/types.ts';
import { Armoire } from '../../components/Armoire.tsx';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { ShelfGrid } from '../../components/ShelfGrid.tsx';
import { cx } from '../../design/wine-types.ts';
import { useHorsLigne } from '../../hors-ligne/contexte.ts';
import type { Emplacement as Cible } from '../../hors-ligne/mutations.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { MESSAGES_MOUVEMENT } from './regles.ts';

const HORS_RANGEMENT: Emplacement = { type: 'hors_rangement' };

const placesLibres = (n: number) => `${n} ${n > 1 ? 'places libres' : 'place libre'}`;

/** Cible d'une mutation : `type` et `id` seulement (contrat §1.5). */
function cible(emplacement: Emplacement): Cible {
  return emplacement.type === 'hors_rangement' ? { type: 'hors_rangement' } : { type: emplacement.type, id: emplacement.id };
}

type Props = {
  bouteille: Bouteille;
  /** Cave et bouteilles lues (mouvements en attente compris) ; null tant qu'elles manquent. */
  cave: Cave | null;
  bouteilles: Bouteille[];
};

/**
 * Déplacer (CdC §3.5) : feuille basse avec l'emplacement proposé (CdC §3.2), « Autre
 * emplacement », Hors rangement, ou le choix manuel ; un emplacement complet n'est jamais
 * proposé ni choisissable. Le mouvement passe par la file, en ligne comme hors ligne.
 */
export function Deplacer({ bouteille, cave, bouteilles }: Props) {
  const horsLigne = useHorsLigne();
  const [ouverte, setOuverte] = useState(false);
  const [rang, setRang] = useState(0);
  const [manuel, setManuel] = useState(false);
  const [choix, setChoix] = useState<Emplacement | null>(null);
  const [message, setMessage] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  const ouvrir = () => {
    setRang(0);
    setManuel(false);
    setChoix(null);
    setMessage(undefined);
    setOuverte(true);
  };

  if (cave === null || horsLigne === null) return <Button disabled>Déplacer</Button>;

  const { place: proposee, candidates } = suggestion(cave, bouteille.location, rang);
  const dejaHors = bouteille.location.type === 'hors_rangement';

  const deplacer = async (destination: Emplacement | null) => {
    if (destination === null) {
      setMessage(MESSAGES_MOUVEMENT.emplacementManquant);
      return;
    }
    if (destination.type !== 'hors_rangement') {
      const place = places(cave).find((p) => memeEmplacement(p.location, destination));
      const refus = place === undefined ? MESSAGES_MOUVEMENT.emplacementDisparu : place.libres === 0 ? messageComplet(place) : null;
      if (refus !== null) {
        setMessage(refus);
        return;
      }
    }
    setEnCours(true);
    try {
      await horsLigne.synchro.ajouter({
        kind: 'move',
        occurred_at: new Date().toISOString(),
        bottle: bouteille.client_ref,
        location: cible(destination),
      });
      setOuverte(false);
    } catch (erreur) {
      setMessage(messageErreur(erreur));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <Button onClick={ouvrir}>Déplacer</Button>
      <Sheet titre="Déplacer la bouteille" ouvert={ouverte} onFermer={() => setOuverte(false)}>
        {manuel ? (
          <ChoixManuel
            cave={cave}
            bouteilles={bouteilles}
            actuel={bouteille.location}
            proposee={proposee}
            choix={choix}
            onChoisir={(emplacement) => {
              setChoix(emplacement);
              setMessage(undefined);
            }}
          />
        ) : proposee === null ? (
          <p>Aucune place libre dans les étagères et les cartons.</p>
        ) : (
          <div>
            <p className="label" style={{ margin: 0 }}>
              Emplacement proposé
            </p>
            <p className="body-strong" style={{ margin: 0 }}>
              {libelleEmplacement(proposee.location)}
            </p>
            <p className="caption" style={{ margin: 0 }}>
              {placesLibres(proposee.libres)}
            </p>
          </div>
        )}
        {message !== undefined && (
          <Banner variante="danger" titre="Déplacement impossible">
            {message}
          </Banner>
        )}
        <div className="ivt-row" style={{ paddingInline: 0 }}>
          <Button
            variante="primary"
            disabled={enCours || (!manuel && proposee === null)}
            onClick={() => void deplacer(manuel ? choix : (proposee?.location ?? null))}
          >
            Déplacer
          </Button>
          {!manuel && (
            <>
              <Button variante="quiet" disabled={candidates < 2} onClick={() => setRang((r) => r + 1)}>
                Autre emplacement
              </Button>
              <Button onClick={() => setManuel(true)}>Choisir manuellement</Button>
              {!dejaHors && (
                <Button disabled={enCours} onClick={() => void deplacer(HORS_RANGEMENT)}>
                  Hors rangement
                </Button>
              )}
            </>
          )}
          <Button variante="quiet" onClick={() => setOuverte(false)}>
            Annuler
          </Button>
        </div>
      </Sheet>
    </>
  );
}

type PropsChoix = {
  cave: Cave;
  bouteilles: Bouteille[];
  actuel: Emplacement;
  proposee: Place | null;
  choix: Emplacement | null;
  onChoisir: (emplacement: Emplacement) => void;
};

/**
 * Choix manuel : les armoires (une étagère = un bouton, complète désactivée), les cartons et
 * Hors rangement. L'emplacement actuel reste visible, sans être choisissable.
 */
function ChoixManuel({ cave, bouteilles, actuel, proposee, choix, onChoisir }: PropsChoix) {
  const estChoisi = (e: Emplacement) => choix !== null && memeEmplacement(choix, e);
  const toutes = places(cave);
  const cartons = toutes.filter((p) => p.location.type === 'carton');

  return (
    <div className="ivt-stack" style={{ padding: 0 }}>
      {cave.cabinets
        .filter((armoire) => armoire.shelves.length > 0)
        .map((armoire) => (
          <Armoire key={armoire.id} nom={armoire.name}>
            {armoire.shelves.map((etagere) => {
              const { location } = toutes.find((p) => memeEmplacement(p.location, { type: 'etagere', id: etagere.id }))!;
              const commun = {
                nom: nomEtagere(etagere),
                capacite: etagere.capacity,
                occupation: rangeesSur(bouteilles, etagere.id).map((b) => b.type),
              };
              if (memeEmplacement(location, actuel)) return <ShelfGrid key={etagere.id} {...commun} />;
              return (
                <ShelfGrid
                  key={etagere.id}
                  {...commun}
                  proposee={proposee !== null && memeEmplacement(proposee.location, location)}
                  selectionnee={estChoisi(location)}
                  onChoisir={() => onChoisir(location)}
                />
              );
            })}
          </Armoire>
        ))}
      {cartons.length > 0 && <p className="body-strong" style={{ margin: 0 }}>Cartons</p>}
      {cartons.map(({ location, capacite, occupees, libres }) => {
        const actuelle = memeEmplacement(location, actuel);
        const etat = actuelle ? 'emplacement actuel' : libres === 0 ? 'complet' : null;
        const propose = proposee !== null && memeEmplacement(proposee.location, location) ? 'proposé' : null;
        const compte = `${occupees} ${occupees > 1 ? 'bouteilles' : 'bouteille'} sur ${capacite}`;
        return (
          <Choix
            key={JSON.stringify(cible(location))}
            nom={libelleEmplacement(location)}
            detail={[compte, etat ?? propose].filter(Boolean).join(', ')}
            choisi={estChoisi(location)}
            desactive={etat !== null}
            onChoisir={() => onChoisir(location)}
          />
        );
      })}
      {actuel.type !== 'hors_rangement' && (
        <Choix
          nom="Hors rangement"
          detail={null}
          choisi={estChoisi(HORS_RANGEMENT)}
          desactive={false}
          onChoisir={() => onChoisir(HORS_RANGEMENT)}
        />
      )}
    </div>
  );
}

/** Emplacement sans alvéoles (carton, Hors rangement), à l'apparence d'une étagère choisissable. */
function Choix(props: { nom: string; detail: string | null; choisi: boolean; desactive: boolean; onChoisir: () => void }) {
  const { nom, detail, choisi, desactive, onChoisir } = props;
  return (
    <button
      type="button"
      className={cx('ivt-shelf', choisi && 'ivt-shelf--selected')}
      aria-label={detail === null ? nom : `${nom}, ${detail}`}
      aria-pressed={choisi}
      disabled={desactive}
      onClick={onChoisir}
    >
      <span className="ivt-shelf__head">
        <span className="ivt-shelf__name">{nom}</span>
        {detail !== null && <span className="ivt-shelf__count">{detail}</span>}
      </span>
    </button>
  );
}
