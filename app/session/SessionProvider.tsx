import { useEffect, useState, type ReactNode } from 'react';
import type { ClientApi } from './clientApi.ts';
import { ContexteSession, type EtatSession } from './contexte.ts';

/** Dernier compte connecté sur l'appareil, pour ouvrir sa base au démarrage hors ligne. */
const CLE_COMPTE = 'invintory.compte';

/** État de la session et compte de la base locale qui va avec. */
function suivre(client: ClientApi, etat: EtatSession): { etat: EtatSession; compte: string | null } {
  if (etat === 'injoignable') {
    try {
      return { etat, compte: localStorage.getItem(CLE_COMPTE) };
    } catch {
      return { etat, compte: null };
    }
  }
  const compte = etat === 'connectee' ? client.compte() : null;
  if (compte !== null) {
    try {
      localStorage.setItem(CLE_COMPTE, compte);
    } catch {
      // Stockage indisponible : seul le démarrage hors ligne en pâtit.
    }
  }
  return { etat, compte };
}

/** Ouvre la session au démarrage avec le ticket (cookie) et suit sa fin côté serveur. */
export function SessionProvider({ client, children }: { client: ClientApi; children: ReactNode }) {
  const [{ etat, compte }, setSuivi] = useState(() => suivre(client, 'verification'));

  useEffect(() => {
    const desabonner = client.surDeconnexion(() => setSuivi(suivre(client, 'deconnectee')));
    client.rafraichir().then(
      (issue) => setSuivi(suivre(client, issue)),
      () => setSuivi(suivre(client, 'injoignable')),
    );
    return desabonner;
  }, [client]);

  const session = {
    etat,
    compte,
    client,
    connecter: async (email: string, motDePasse: string) => {
      await client.connecter(email, motDePasse);
      setSuivi(suivre(client, 'connectee'));
    },
    oublier: () => {
      client.oublier();
      setSuivi(suivre(client, 'deconnectee'));
    },
  };

  return <ContexteSession value={session}>{children}</ContexteSession>;
}
