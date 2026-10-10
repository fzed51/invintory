import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useFiche } from '../../cave/fiche.ts';
import { dateHeure, dateJour, moisAnnee, MOTIFS_SORTIE, ORIGINES, TYPES_MOUVEMENT } from '../../cave/format.ts';
import { libelleEmplacement } from '../../cave/lecture.ts';
import type { Bouteille, Emplacement, Mouvement } from '../../cave/types.ts';
import { cheminArmoire, cheminCarton } from '../../chemins.ts';
import { BadgeSouvenir, BadgeType, BadgeUrgent } from '../../components/Badge.tsx';
import { Banner } from '../../components/Banner.tsx';
import { injoignable } from '../../hors-ligne/cache.ts';
import { ErreurApi, messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { Introuvable, LienBouton, LienTexte, Section } from '../cave/communs.tsx';

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

  const { bouteille, mouvements } = lecture;
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
      <LienBouton vers={`/bottles/${bouteille.id}/edit`}>Modifier</LienBouton>
      <Section niveau={2} titre="Historique">
        {mouvements === null ? (
          <p>Historique indisponible hors ligne.</p>
        ) : (
          <ol className="ivt-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {mouvements.map((mouvement) => (
              <LigneMouvement key={mouvement.id} mouvement={mouvement} />
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

/** Emplacement actuel, avec un lien vers l'armoire ou le carton. */
function LienEmplacement({ emplacement }: { emplacement: Emplacement }) {
  if (emplacement.type === 'etagere') {
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

function LigneMouvement({ mouvement }: { mouvement: Mouvement }) {
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
