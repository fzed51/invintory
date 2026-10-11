import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { superposerFiche, type EnAttente, type MouvementEnAttente } from '../../cave/attente.ts';
import { useFiche, type FicheLue } from '../../cave/fiche.ts';
import { dateHeure, dateJour, moisAnnee, MOTIFS_SORTIE, ORIGINES, TYPES_MOUVEMENT } from '../../cave/format.ts';
import { libelleEmplacement, useCave } from '../../cave/lecture.ts';
import type { Bouteille, Emplacement } from '../../cave/types.ts';
import { cheminArmoire, cheminCarton } from '../../chemins.ts';
import { BadgeSouvenir, BadgeType, BadgeUrgent } from '../../components/Badge.tsx';
import { Banner } from '../../components/Banner.tsx';
import { injoignable } from '../../hors-ligne/cache.ts';
import { ErreurApi, messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { Introuvable, LienBouton, LienTexte, Section } from '../cave/communs.tsx';
import { Deplacer } from './Deplacer.tsx';
import { Sortir } from './Sortir.tsx';

/** Fiche bouteille (CdC §2.2) : attributs, photo, historique des mouvements (§2.4). */
export function FicheEcran() {
  const id = Number(useParams().id);
  const lecture = useFiche(id);

  if (lecture.etat === 'chargement') return <Banner titre="Chargement de la fiche" />;
  if (lecture.etat === 'erreur') {
    if (lecture.erreur instanceof ErreurApi && lecture.erreur.code === 'NOT_FOUND') {
      return <Introuvable titre="Bouteille introuvable" detail="Aucune bouteille de cette cave ne porte ce numéro." />;
    }
    return (
      <Banner variante="danger" titre="Fiche indisponible">
        {messageErreur(lecture.erreur)}
      </Banner>
    );
  }

  return <Fiche lue={lecture} attente={lecture.attente} />;
}

/** Fiche lue, avec les mouvements en attente superposés (état, historique). */
function Fiche({ lue, attente }: { lue: FicheLue; attente: EnAttente[] }) {
  const cave = useCave();
  const { bouteille, enAttente } = superposerFiche(lue.bouteille, cave.etat === 'pret' ? cave.cave : null, attente);
  const { mouvements } = lue;
  return (
    <>
      <h1 className="title-1">{bouteille.domain ?? 'Domaine non renseigné'}</h1>
      <div className="ivt-row" style={{ padding: 0 }}>
        <span className="ivt-ref">{bouteille.reference.toLowerCase()}</span>
        <BadgeType type={bouteille.type} />
        {bouteille.souvenir && <BadgeSouvenir />}
        {bouteille.urgent && <BadgeUrgent />}
      </div>
      <Photo bouteille={bouteille} />
      <Attributs bouteille={bouteille} />
      <div className="ivt-row" style={{ padding: 0 }}>
        {bouteille.status === 'en_cave' && (
          <>
            <Deplacer
              bouteille={bouteille}
              cave={cave.etat === 'pret' ? cave.cave : null}
              bouteilles={cave.etat === 'pret' ? cave.bouteilles : []}
            />
            <Sortir bouteille={bouteille} />
          </>
        )}
        <LienBouton vers={`/bottles/${bouteille.id}/edit`}>Modifier</LienBouton>
      </div>
      <Section niveau={2} titre="Historique">
        {mouvements === null && <p>Historique indisponible hors ligne.</p>}
        {(mouvements !== null || enAttente.length > 0) && (
          <ol className="ivt-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {mouvements?.map((mouvement) => <LigneMouvement key={mouvement.id} mouvement={mouvement} />)}
            {enAttente.map((mouvement) => (
              <LigneMouvement key={mouvement.client_ref} mouvement={mouvement} enAttente />
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

/** Emplacement actuel, avec un lien vers l'armoire ou le carton. */
function LienEmplacement({ emplacement }: { emplacement: Emplacement }) {
  // Destination en attente dont la cave n'est pas lue : libellé seul.
  if (emplacement.type === 'etagere' && emplacement.cabinet_id !== undefined) {
    return <LienTexte vers={cheminArmoire(emplacement.cabinet_id)}>{emplacement.label}</LienTexte>;
  }
  if (emplacement.type === 'carton') return <LienTexte vers={cheminCarton(emplacement.id)}>{emplacement.label}</LienTexte>;
  return <>{libelleEmplacement(emplacement)}</>;
}

function Attributs({ bouteille }: { bouteille: Bouteille }) {
  const lignes: [string, ReactNode][] = [
    ['Région', bouteille.region?.name ?? 'Non renseignée'],
    ['Cépage', bouteille.grape?.name ?? 'Non renseigné'],
    ['Millésime', bouteille.vintage ?? 'non millésimé'],
    ['Date d’entrée', moisAnnee(bouteille.entry_date)],
    ['Origine', ORIGINES[bouteille.origin as keyof typeof ORIGINES] ?? bouteille.origin],
    ['Note', bouteille.note || 'Aucune'],
    ['Souvenir', bouteille.souvenir ? 'Oui' : 'Non'],
    ['Statut', bouteille.status === 'en_cave' ? 'En cave' : 'Sortie'],
  ];
  if (bouteille.status === 'en_cave') lignes.push(['Emplacement', <LienEmplacement emplacement={bouteille.location} />]);
  lignes.push(['Date limite de consommation', dateJour(bouteille.drink_by)]);

  return (
    <dl className="ivt-stack" style={{ margin: 0, padding: 0 }}>
      {lignes.map(([terme, valeur]) => (
        <div key={terme}>
          <dt className="label">{terme}</dt>
          <dd style={{ margin: 0 }}>{valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

function LigneMouvement({ mouvement, enAttente = false }: { mouvement: MouvementEnAttente; enAttente?: boolean }) {
  const de = mouvement.from && libelleEmplacement(mouvement.from);
  const vers = mouvement.to && libelleEmplacement(mouvement.to);
  const titre =
    mouvement.type === 'sortie' && mouvement.exit_reason !== null
      ? `${TYPES_MOUVEMENT.sortie} — ${MOTIFS_SORTIE[mouvement.exit_reason]}`
      : TYPES_MOUVEMENT[mouvement.type];
  const trajet = [de && `de ${de}`, vers && `vers ${vers}`].filter(Boolean).join(' ');

  return (
    <li>
      <p className="body-strong" style={{ margin: 0 }}>
        {titre}
      </p>
      {trajet !== '' && <p style={{ margin: 0 }}>{trajet}</p>}
      <p className="caption" style={{ margin: 0 }}>
        {dateHeure(mouvement.occurred_at)}
      </p>
      {enAttente && (
        <p className="caption" style={{ margin: 0 }}>
          En attente de synchronisation
        </p>
      )}
    </li>
  );
}

/**
 * Photo servie par une route authentifiée (contrat §11) : chargée avec le jeton, affichée
 * par une URL d'objet, libérée en quittant la fiche.
 */
function Photo({ bouteille }: { bouteille: Bouteille }) {
  const { client } = useSession();
  const [photo, setPhoto] = useState<{ url: string } | { erreur: unknown } | null>(null);
  const { id, has_photo: aUnePhoto } = bouteille;

  useEffect(() => {
    if (!aUnePhoto) return;
    let actif = true;
    let url: string | null = null;
    client.requete<Blob>(`/api/bottles/${id}/photo`, { format: 'blob' }).then(
      (blob) => {
        if (!actif) return;
        url = URL.createObjectURL(blob);
        setPhoto({ url });
      },
      (erreur: unknown) => {
        if (actif) setPhoto({ erreur });
      },
    );
    return () => {
      actif = false;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [client, id, aUnePhoto]);

  if (!aUnePhoto || photo === null) return null;
  if ('erreur' in photo) {
    return <p>{injoignable(photo.erreur) ? 'Photo indisponible sans réseau.' : 'Photo indisponible.'}</p>;
  }
  return (
    <img
      src={photo.url}
      alt={`Photo de la bouteille ${bouteille.reference.toLowerCase()}`}
      style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 'var(--radius-lg)' }}
    />
  );
}
