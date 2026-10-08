import { useEffect, useState, type ReactNode } from 'react';
import type { ClientApi } from './clientApi.ts';
import { ContexteSession, type EtatSession } from './contexte.ts';

/** Ouvre la session au démarrage avec le ticket (cookie) et suit sa fin côté serveur. */
export function SessionProvider({ client, children }: { client: ClientApi; children: ReactNode }) {
  const [etat, setEtat] = useState<EtatSession>('verification');

  useEffect(() => {
    const desabonner = client.surDeconnexion(() => setEtat('deconnectee'));
    client.rafraichir().then(setEtat, () => setEtat('injoignable'));
    return desabonner;
  }, [client]);

  const session = {
    etat,
    client,
    connecter: async (email: string, motDePasse: string) => {
      await client.connecter(email, motDePasse);
      setEtat('connectee');
    },
    oublier: () => {
      client.oublier();
      setEtat('deconnectee');
    },
  };

  return <ContexteSession value={session}>{children}</ContexteSession>;
}
