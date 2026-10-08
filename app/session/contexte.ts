import { createContext, useContext } from 'react';
import type { ClientApi } from './clientApi.ts';

/**
 * - verification : rafraîchissement de démarrage en cours ;
 * - injoignable : serveur hors d'atteinte au démarrage, session présumée (hors ligne) ;
 * - deconnectee : aucune session, ou session terminée côté serveur.
 */
export type EtatSession = 'verification' | 'connectee' | 'injoignable' | 'deconnectee';

export type Session = {
  etat: EtatSession;
  client: ClientApi;
  connecter: (email: string, motDePasse: string) => Promise<void>;
  /** Session fermée côté serveur par un autre moyen (nouveau mot de passe). */
  oublier: () => void;
};

export const ContexteSession = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(ContexteSession);
  if (session === null) throw new Error('useSession hors de SessionProvider.');
  return session;
}
