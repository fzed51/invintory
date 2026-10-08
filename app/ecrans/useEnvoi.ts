import { useState } from 'react';

/** État d'un formulaire envoyé au serveur : envoi en cours et dernière erreur. */
export function useEnvoi() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);

  async function envoyer(action: () => Promise<void>): Promise<void> {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return { enCours, erreur, envoyer };
}
