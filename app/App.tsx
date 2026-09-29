import { useEffect, useState } from 'react';
import { verifierSante } from './api.ts';
import { Banner } from './Banner.tsx';
import { PwaBanner } from './PwaBanner.tsx';

type Etat =
  | { statut: 'chargement' }
  | { statut: 'ok'; reponse: string }
  | { statut: 'erreur'; message: string };

export function App() {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  useEffect(() => {
    verifierSante()
      .then((reponse) => setEtat({ statut: 'ok', reponse: JSON.stringify(reponse) }))
      .catch((erreur: unknown) =>
        setEtat({
          statut: 'erreur',
          message: erreur instanceof Error ? erreur.message : 'Erreur inconnue.',
        }),
      );
  }, []);

  return (
    <main className="ivt-stack">
      <PwaBanner />
      <h1 className="display">Invintory</h1>
      {etat.statut === 'chargement' && <Banner titre="Vérification de l'API en cours" />}
      {etat.statut === 'ok' && (
        <Banner variante="success" titre="API disponible">
          Réponse de /api/health : {etat.reponse}
        </Banner>
      )}
      {etat.statut === 'erreur' && (
        <Banner variante="danger" titre="API indisponible">
          {etat.message} Réessayer dans un instant.
        </Banner>
      )}
    </main>
  );
}
