import { Banner } from '../components/Banner.tsx';
import { useHorsLigne } from './contexte.ts';
import { useEnLigne, useEtatFile } from './etat.ts';

function compte(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

/**
 * Bandeaux de la synchronisation : hors ligne, envoi en attente (avec nouvel essai), et
 * modifications refusées par le serveur, à lire puis à fermer.
 */
export function BandeauSynchro() {
  const horsLigne = useHorsLigne();
  const enLigne = useEnLigne();
  const etat = useEtatFile(horsLigne?.base ?? null);

  const attente = [
    etat?.mouvements ? `${compte(etat.mouvements, 'mouvement', 'mouvements')} en attente de synchronisation.` : null,
    etat?.photos ? `${compte(etat.photos, 'photo', 'photos')} en attente d’envoi.` : null,
  ].filter((texte) => texte !== null);
  const rejets = etat?.rejets ?? [];

  return (
    <>
      {!enLigne && (
        <Banner titre="Hors ligne" icone="horsLigne">
          {attente.length > 0 ? attente.join(' ') : 'Les modifications seront envoyées au retour du réseau.'}
        </Banner>
      )}
      {enLigne && attente.length > 0 && (
        <Banner
          titre="En attente de synchronisation"
          actions={
            <div className="ivt-row">
              <button
                type="button"
                className="ivt-btn ivt-btn--secondary"
                onClick={() => void horsLigne?.synchro.synchroniser().catch(() => undefined)}
              >
                Réessayer
              </button>
            </div>
          }
        >
          {attente.join(' ')}
        </Banner>
      )}
      {rejets.length > 0 && (
        <Banner
          variante="warning"
          titre="Modifications refusées"
          actions={
            <div className="ivt-row">
              <button type="button" className="ivt-btn ivt-btn--quiet" onClick={() => void horsLigne?.base.rejets.clear()}>
                Fermer
              </button>
            </div>
          }
        >
          {`${compte(rejets.length, 'modification refusée', 'modifications refusées')} par le serveur, non enregistrée${rejets.length > 1 ? 's' : ''} :`}
          <ul>
            {rejets.map((rejet) => (
              <li key={rejet.id}>{rejet.message}</li>
            ))}
          </ul>
        </Banner>
      )}
    </>
  );
}
