import { useRegisterSW } from 'virtual:pwa-register/react';
import { Banner } from './Banner.tsx';

const UNE_HEURE = 60 * 60 * 1000;

/** Bandeau « nouvelle version » : le service worker n'est remplacé qu'à la demande de l'utilisateur. */
export function PwaBanner() {
  const {
    needRefresh: [nouvelleVersion, setNouvelleVersion],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_urlSw, registration) {
      if (!registration) return;
      // Recherche horaire d'une nouvelle version, sauf hors ligne ou installation en cours.
      setInterval(() => {
        if (registration.installing || !navigator.onLine) return;
        void registration.update();
      }, UNE_HEURE);
    },
  });

  if (!nouvelleVersion) return null;

  return (
    <Banner
      titre="Nouvelle version disponible"
      actions={
        <div className="ivt-row">
          <button type="button" className="ivt-btn ivt-btn--primary" onClick={() => void updateServiceWorker(true)}>
            Actualiser
          </button>
          <button type="button" className="ivt-btn ivt-btn--quiet" onClick={() => setNouvelleVersion(false)}>
            Plus tard
          </button>
        </div>
      }
    >
      Actualiser pour utiliser la dernière version.
    </Banner>
  );
}
