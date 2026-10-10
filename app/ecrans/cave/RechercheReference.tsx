import { useState } from 'react';
import { useNavigate } from 'react-router';
import { chercherReference } from '../../cave/fiche.ts';
import { normaliserReference } from '../../cave/format.ts';
import { cheminBouteille } from '../../chemins.ts';
import { Button } from '../../components/Button.tsx';
import { Field } from '../../components/Field.tsx';
import { useHorsLigne } from '../../hors-ligne/contexte.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { MESSAGES_FICHE } from '../bouteille/regles.ts';
import { Formulaire } from '../Page.tsx';

/**
 * Recherche par référence (CdC §2.3) : ouvre la fiche trouvée. Serveur injoignable, la
 * recherche porte sur la copie locale des bouteilles en cave.
 */
export function RechercheReference() {
  const { client } = useSession();
  const horsLigne = useHorsLigne();
  const naviguer = useNavigate();
  const [saisie, setSaisie] = useState('');
  const [message, setMessage] = useState<string | undefined>();
  const [enCours, setEnCours] = useState(false);

  const rechercher = async () => {
    const reference = normaliserReference(saisie);
    if (reference === '') {
      setMessage(MESSAGES_FICHE.referenceManquante);
      return;
    }
    setEnCours(true);
    try {
      const { id, horsLigne: copie } = await chercherReference(client, horsLigne?.base ?? null, reference);
      if (id !== null) {
        void naviguer(cheminBouteille(id));
        return;
      }
      setMessage(
        copie
          ? `Aucune bouteille en cave avec la référence « ${reference} » dans la copie locale.`
          : `Aucune bouteille avec la référence « ${reference} ».`,
      );
    } catch (erreur) {
      setMessage(messageErreur(erreur));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Formulaire onEnvoi={() => void rechercher()}>
      <Field
        libelle="Référence"
        reference
        aide="Le code noté sur l’étiquette."
        erreur={message}
        value={saisie}
        onChange={(e) => {
          setSaisie(e.target.value);
          setMessage(undefined);
        }}
      />
      <Button type="submit" disabled={enCours}>
        Rechercher
      </Button>
    </Formulaire>
  );
}
