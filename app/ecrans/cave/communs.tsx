import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { libelleEmplacement, useCave, type CaveLue } from '../../cave/lecture.ts';
import type { Bouteille } from '../../cave/types.ts';
import { CHEMINS, cheminBouteille } from '../../chemins.ts';
import { Banner } from '../../components/Banner.tsx';
import { BottleCard } from '../../components/BottleCard.tsx';
import { Button } from '../../components/Button.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { useEnLigne } from '../../hors-ligne/etat.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { LienDiscret } from '../Page.tsx';
import { MESSAGES_EMPLACEMENT } from './regles.ts';

/** Rend son contenu une fois la cave lue ; chargement et échec sont dits à sa place. */
export function AvecCave({ children }: { children: (lue: CaveLue & { recharger: () => void }) => ReactNode }) {
  const lecture = useCave();
  if (lecture.etat === 'chargement') return <Banner titre="Chargement de la cave" />;
  if (lecture.etat === 'erreur') {
    return (
      <Banner variante="danger" titre="Cave indisponible">
        {messageErreur(lecture.erreur)}
      </Banner>
    );
  }
  return children(lecture);
}

/** Section nommée par son titre (rôle region), pour la structure et les lecteurs d'écran. */
export function Section({ titre, niveau, children }: { titre: ReactNode; niveau: 2 | 3; children: ReactNode }) {
  const id = useId();
  const Titre = niveau === 2 ? 'h2' : 'h3';
  return (
    <section className="ivt-stack" style={{ padding: 0 }} aria-labelledby={id}>
      <Titre id={id} className={niveau === 2 ? 'title-2' : 'body-strong'}>
        {titre}
      </Titre>
      {children}
    </section>
  );
}

const LISTE = { listStyle: 'none', margin: 0, padding: 0 } as const;

/** Bouteilles d'un emplacement ; chacune ouvre sa fiche. */
export function ListeBouteilles({ bouteilles }: { bouteilles: Bouteille[] }) {
  if (bouteilles.length === 0) return <p>Aucune bouteille.</p>;
  return (
    <ul className="ivt-stack" style={LISTE}>
      {bouteilles.map((b) => (
        <li key={b.id}>
          <BottleCard
            href={cheminBouteille(b.id)}
            domaine={b.domain}
            region={b.region?.name ?? null}
            cepage={b.grape?.name ?? null}
            millesime={b.vintage}
            type={b.type}
            emplacement={libelleEmplacement(b.location)}
            reference={b.reference}
            souvenir={b.souvenir}
            urgent={b.urgent}
          />
        </li>
      ))}
    </ul>
  );
}

/** Lien dans un titre ou un texte : couleur du texte qui l'entoure, souligné. */
export function LienTexte({ vers, children }: { vers: string; children: ReactNode }) {
  return (
    <Link to={vers} style={{ color: 'inherit' }}>
      {children}
    </Link>
  );
}

/** Lien à l'apparence d'un bouton secondaire. */
export function LienBouton({ vers, children }: { vers: string; children: ReactNode }) {
  return (
    <Link className="ivt-btn ivt-btn--secondary" to={vers}>
      {children}
    </Link>
  );
}

export function Introuvable({ titre }: { titre: string }) {
  return (
    <>
      <h1 className="title-1">{titre}</h1>
      <p>Il a peut-être été supprimé depuis un autre appareil.</p>
      <LienDiscret vers={CHEMINS.cave}>Voir la cave</LienDiscret>
    </>
  );
}

/** Emplacements en ligne uniquement (P7) : hors ligne, le dit. */
export function AvisReseau() {
  return useEnLigne() ? null : <p>{MESSAGES_EMPLACEMENT.reseauRequis}</p>;
}

const SUPPRESSION = {
  armoire: { action: 'Supprimer l’armoire', de: 'de cette armoire', vide: 'Aucune bouteille n’est rangée dans cette armoire.' },
  etagere: { action: 'Supprimer l’étagère', de: 'de cette étagère', vide: 'Aucune bouteille n’est rangée sur cette étagère.' },
  carton: { action: 'Supprimer le carton', de: 'de ce carton', vide: 'Aucune bouteille n’est rangée dans ce carton.' },
};

/** Conséquence d'une suppression (CdC §3.1 : jamais bloquée, contenu basculé en Hors rangement). */
function consequence(quoi: keyof typeof SUPPRESSION, bouteilles: number): string {
  const { de, vide } = SUPPRESSION[quoi];
  if (bouteilles === 0) return vide;
  if (bouteilles === 1) return `La bouteille ${de} passera en Hors rangement.`;
  return `Les ${bouteilles} bouteilles ${de} passeront en Hors rangement.`;
}

/**
 * Suppression d'un emplacement, confirmée dans une feuille basse qui annonce le sort des
 * bouteilles. Bouton secondaire : le design system réserve « danger » à Sortir.
 */
export function Suppression({
  quoi,
  bouteilles,
  route,
  possible,
  onSupprime,
}: {
  quoi: keyof typeof SUPPRESSION;
  bouteilles: number;
  /** Route DELETE de l'emplacement. */
  route: string;
  possible: boolean;
  onSupprime: () => void;
}) {
  const { client } = useSession();
  const [ouverte, setOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const { action } = SUPPRESSION[quoi];

  const supprimer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await client.requete(route, { methode: 'DELETE' });
      setOuverte(false);
      onSupprime();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <Button disabled={!possible} onClick={() => setOuverte(true)}>
        {action}
      </Button>
      <Sheet titre={action} ouvert={ouverte} onFermer={() => setOuverte(false)}>
        <p>{consequence(quoi, bouteilles)}</p>
        {erreur !== null && (
          <Banner variante="danger" titre="Suppression refusée">
            {messageErreur(erreur)}
          </Banner>
        )}
        <div className="ivt-row">
          <Button disabled={enCours || !possible} onClick={() => void supprimer()}>
            Supprimer
          </Button>
          <Button variante="quiet" onClick={() => setOuverte(false)}>
            Annuler
          </Button>
        </div>
      </Sheet>
    </>
  );
}
