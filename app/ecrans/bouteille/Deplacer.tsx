import { useState } from 'react';
import { memeEmplacement, places, suggestion, messageComplet } from '../../cave/attente.ts';
import { libelleEmplacement } from '../../cave/lecture.ts';
import type { Bouteille, Cave, Emplacement } from '../../cave/types.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { useHorsLigne } from '../../hors-ligne/contexte.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { ChoixManuel } from './ChoixEmplacement.tsx';
import { cible, HORS_RANGEMENT, placesLibres } from './emplacement.ts';
import { MESSAGES_MOUVEMENT } from './regles.ts';

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
