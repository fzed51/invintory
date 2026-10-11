import { useState } from 'react';
import { MOTIFS_SORTIE } from '../../cave/format.ts';
import type { Bouteille } from '../../cave/types.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { useHorsLigne } from '../../hors-ligne/contexte.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { MESSAGES_MOUVEMENT } from './regles.ts';

type Motif = keyof typeof MOTIFS_SORTIE;
const OPTIONS_MOTIF = (Object.keys(MOTIFS_SORTIE) as Motif[]).map((valeur) => ({ valeur, libelle: MOTIFS_SORTIE[valeur] }));

/**
 * Sortir (CdC §3.4) : irréversible, motif obligatoire sans valeur par défaut, confirmé dans
 * une feuille basse. Seul usage du bouton « danger » (DS). Passe par la file, comme Déplacer.
 */
export function Sortir({ bouteille }: { bouteille: Bouteille }) {
  const horsLigne = useHorsLigne();
  const [ouverte, setOuverte] = useState(false);
  const [motif, setMotif] = useState<Motif | null>(null);
  const [message, setMessage] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  if (horsLigne === null) {
    return (
      <Button variante="danger" disabled>
        Sortir
      </Button>
    );
  }

  const ouvrir = () => {
    setMotif(null);
    setMessage(undefined);
    setOuverte(true);
  };

  const sortir = async () => {
    if (motif === null) {
      setMessage(MESSAGES_MOUVEMENT.motifManquant);
      return;
    }
    setEnCours(true);
    try {
      await horsLigne.synchro.ajouter({
        kind: 'exit',
        occurred_at: new Date().toISOString(),
        bottle: bouteille.client_ref,
        exit_reason: motif,
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
      <Button variante="danger" onClick={ouvrir}>
        Sortir
      </Button>
      <Sheet titre="Sortir la bouteille" ouvert={ouverte} onFermer={() => setOuverte(false)}>
        <p>La sortie est définitive : la bouteille quitte la cave.</p>
        <p className="label" style={{ margin: 0 }} aria-hidden="true">
          Motif
        </p>
        <SegmentedControl
          libelle="Motif"
          options={OPTIONS_MOTIF}
          valeur={motif}
          onChange={(valeur) => {
            setMotif(valeur);
            setMessage(undefined);
          }}
        />
        {message !== undefined && (
          <Banner variante="danger" titre="Sortie impossible">
            {message}
          </Banner>
        )}
        <div className="ivt-row" style={{ paddingInline: 0 }}>
          <Button variante="danger" disabled={enCours} onClick={() => void sortir()}>
            Sortir
          </Button>
          <Button variante="quiet" onClick={() => setOuverte(false)}>
            Annuler
          </Button>
        </div>
      </Sheet>
    </>
  );
}
