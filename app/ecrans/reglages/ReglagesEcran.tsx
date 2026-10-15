import { useEffect, useState } from 'react';
import { CHEMINS } from '../../chemins.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Field } from '../../components/Field.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { useEnLigne } from '../../hors-ligne/etat.ts';
import { nomDuFichier, telecharger } from '../../reglages/export.ts';
import { messageErreur } from '../../session/clientApi.ts';
import { useSession } from '../../session/contexte.ts';
import { choisirTheme, themeChoisi, type Theme } from '../../theme.ts';
import { LienBouton, Section } from '../cave/communs.tsx';
import { Formulaire, LienDiscret } from '../Page.tsx';
import { useEnvoi } from '../useEnvoi.ts';
import { useErreurs, verifierEmail, verifierMotDePasse } from '../validation.ts';

type Appareil = { id: number; device: string | null; created_at: string; last_used_at: string; current: boolean };

type Lecture<T> = { etat: 'chargement' } | { etat: 'erreur'; erreur: unknown } | { etat: 'pret'; donnees: T };

const LISTE = { listStyle: 'none', margin: 0, padding: 0 } as const;
const SANS_MARGE = { margin: 0 } as const;
const RANGEE = { className: 'ivt-row', style: { padding: 0, flexWrap: 'wrap' } } as const;
const JOUR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const jour = (date: string) => JOUR.format(new Date(date));

const RESEAU_REQUIS = 'Réseau requis pour gérer le compte et exporter la cave.';

const THEMES = [
  { valeur: 'systeme', libelle: 'Système' },
  { valeur: 'light', libelle: 'Clair' },
  { valeur: 'dark', libelle: 'Sombre' },
] as const;

/**
 * Route lue en ligne uniquement (compte, appareils : pas de copie locale) ; pas de lecture
 * hors ligne. `version` change pour relire après une écriture.
 */
function useLectureEnLigne<T>(route: string, version = 0): Lecture<T> {
  const { client } = useSession();
  const enLigne = useEnLigne();
  const [lecture, setLecture] = useState<Lecture<T>>({ etat: 'chargement' });

  useEffect(() => {
    if (!enLigne) return;
    let actif = true;
    client.requete<T>(route).then(
      (donnees) => {
        if (actif) setLecture({ etat: 'pret', donnees });
      },
      (erreur: unknown) => {
        if (actif) setLecture({ etat: 'erreur', erreur });
      },
    );
    return () => {
      actif = false;
    };
  }, [client, enLigne, route, version]);

  return lecture;
}

/** Thème manuel, prioritaire sur celui du système (design system §Intégration). */
function ChoixTheme() {
  const [theme, setTheme] = useState<Theme | 'systeme'>(() => themeChoisi() ?? 'systeme');
  return (
    <SegmentedControl
      libelle="Thème"
      options={THEMES}
      valeur={theme}
      onChange={(choix) => {
        setTheme(choix);
        choisirTheme(choix === 'systeme' ? null : choix);
      }}
    />
  );
}

/** Adresse du compte, changement d'adresse, mot de passe (flux de réinitialisation), déconnexion. */
function Compte() {
  const session = useSession();
  const enLigne = useEnLigne();
  const compte = useLectureEnLigne<{ email: string }>('/api/account');
  const motDePasse = useEnvoi();
  const deconnexion = useEnvoi();
  const [lienEnvoye, setLienEnvoye] = useState(false);
  const email = enLigne && compte.etat === 'pret' ? compte.donnees.email : null;

  const changerMotDePasse = () => {
    if (email === null) return;
    void motDePasse.envoyer(async () => {
      await session.client.requete('/api/auth/password/forgot', { methode: 'POST', corps: { email }, publique: true });
      setLienEnvoye(true);
    });
  };

  return (
    <Section titre="Compte" niveau={2}>
      {enLigne && compte.etat === 'chargement' && <Banner titre="Chargement du compte" />}
      {enLigne && compte.etat === 'erreur' && (
        <Banner variante="danger" titre="Compte indisponible">
          {messageErreur(compte.erreur)}
        </Banner>
      )}
      {email !== null && <p className="body-strong" style={SANS_MARGE}>
          {email}
        </p>}
      <div {...RANGEE}>
        <LienBouton vers={CHEMINS.changerEmail}>Changer d’adresse email</LienBouton>
        <Button disabled={email === null || motDePasse.enCours} onClick={changerMotDePasse}>
          Changer le mot de passe
        </Button>
      </div>
      {lienEnvoye && (
        <Banner variante="success" titre="Lien envoyé">
          Un lien pour choisir un nouveau mot de passe vient d’être envoyé à {email}. Il expire dans une heure.
        </Banner>
      )}
      {motDePasse.erreur !== null && (
        <Banner variante="danger" titre="Demande refusée">
          {messageErreur(motDePasse.erreur)}
        </Banner>
      )}
      {deconnexion.erreur !== null && (
        <Banner variante="danger" titre="Déconnexion impossible">
          {messageErreur(deconnexion.erreur)}
        </Banner>
      )}
      <div {...RANGEE}>
        <Button
          disabled={!enLigne || deconnexion.enCours}
          onClick={() => void deconnexion.envoyer(session.deconnecter)}
        >
          Se déconnecter
        </Button>
      </div>
    </Section>
  );
}

/** Appareils où le compte est connecté ; les autres que celui-ci peuvent être déconnectés. */
function Appareils() {
  const { client } = useSession();
  const enLigne = useEnLigne();
  const [version, setVersion] = useState(0);
  const lecture = useLectureEnLigne<{ devices: Appareil[] }>('/api/auth/devices', version);
  const revocation = useEnvoi();

  const revoquer = (id: number) =>
    void revocation.envoyer(async () => {
      await client.requete(`/api/auth/devices/${id}`, { methode: 'DELETE' });
      setVersion((v) => v + 1);
    });

  if (!enLigne) return null;
  return (
    <Section titre="Appareils connectés" niveau={2}>
      {lecture.etat === 'chargement' && <Banner titre="Chargement des appareils" />}
      {lecture.etat === 'erreur' && (
        <Banner variante="danger" titre="Appareils indisponibles">
          {messageErreur(lecture.erreur)}
        </Banner>
      )}
      {revocation.erreur !== null && (
        <Banner variante="danger" titre="Déconnexion refusée">
          {messageErreur(revocation.erreur)}
        </Banner>
      )}
      {lecture.etat === 'pret' && (
        <ul className="ivt-stack" style={LISTE} aria-label="Appareils connectés">
          {lecture.donnees.devices.map((appareil) => {
            const nom = appareil.device ?? 'Appareil non reconnu';
            return (
              <li key={appareil.id} className="ivt-bottle">
                <div>
                  <h3 className="ivt-bottle__title">{nom}</h3>
                  <p className="ivt-bottle__meta">
                    Connecté le {jour(appareil.created_at)} · Dernière activité le {jour(appareil.last_used_at)}
                  </p>
                  {appareil.current ? (
                    <span className="ivt-badge">Cet appareil</span>
                  ) : (
                    <Button
                      variante="quiet"
                      aria-label={`Déconnecter ${nom}`}
                      disabled={revocation.enCours}
                      onClick={() => revoquer(appareil.id)}
                    >
                      Déconnecter
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** Archive ZIP de la cave (contrat §12), seule sauvegarde manuelle (Arch §7). */
function Export() {
  const { client } = useSession();
  const enLigne = useEnLigne();
  const { enCours, erreur, envoyer } = useEnvoi();
  const [fichier, setFichier] = useState<string | null>(null);

  const exporter = () =>
    void envoyer(async () => {
      setFichier(null);
      const reponse = await client.requete<Response>('/api/export', { format: 'reponse' });
      const nom = nomDuFichier(reponse.headers.get('Content-Disposition'));
      telecharger(await reponse.blob(), nom);
      setFichier(nom);
    });

  return (
    <Section titre="Données" niveau={2}>
      <p style={SANS_MARGE}>Archive ZIP de toute la cave : emplacements, catégories, bouteilles, mouvements et photos.</p>
      <div {...RANGEE}>
        <Button disabled={!enLigne || enCours} onClick={exporter}>
          Exporter la cave
        </Button>
      </div>
      {fichier !== null && (
        <Banner variante="success" titre="Export téléchargé">
          {fichier}
        </Banner>
      )}
      {erreur !== null && (
        <Banner variante="danger" titre="Export impossible">
          {messageErreur(erreur)}
        </Banner>
      )}
    </Section>
  );
}

/** Réglages (CdC §3.9) : thème, catégories, compte, appareils, export. */
export function ReglagesEcran() {
  const enLigne = useEnLigne();
  return (
    <>
      <h1 className="title-1">Réglages</h1>
      {!enLigne && <p>{RESEAU_REQUIS}</p>}
      <Section titre="Apparence" niveau={2}>
        <ChoixTheme />
      </Section>
      <Section titre="Catégories" niveau={2}>
        <p style={SANS_MARGE}>Seuils de manque et durées de garde, par type et par région.</p>
        <div {...RANGEE}>
          <LienBouton vers={CHEMINS.categories}>Gérer les catégories</LienBouton>
        </div>
      </Section>
      <Compte />
      <Appareils />
      <Export />
    </>
  );
}

/** Nouvelle adresse, confirmée par le lien envoyé à celle-ci (page de retour `email_change`). */
export function ChangerEmail() {
  const { client } = useSession();
  const { enCours, erreur, envoyer } = useEnvoi();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoyeA, setEnvoyeA] = useState<string | null>(null);
  const { erreurs, verifier, effacer } = useErreurs<'email' | 'motDePasse'>();

  const demander = () => {
    if (!verifier({ email: verifierEmail(email), motDePasse: verifierMotDePasse(motDePasse) })) return;
    void envoyer(async () => {
      await client.requete('/api/account/email', { methode: 'POST', corps: { email, password: motDePasse } });
      setEnvoyeA(email);
    });
  };

  return (
    <>
      <h1 className="title-1">Changer d’adresse email</h1>
      {envoyeA !== null ? (
        <Banner variante="success" titre="Lien envoyé">
          Un lien de confirmation vient d’être envoyé à {envoyeA}. L’adresse du compte change une fois ce lien ouvert.
        </Banner>
      ) : (
        <Formulaire onEnvoi={demander}>
          <Field
            libelle="Nouvelle adresse email"
            type="email"
            autoComplete="email"
            erreur={erreurs.email}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              effacer('email');
            }}
          />
          <Field
            libelle="Mot de passe actuel"
            type="password"
            autoComplete="current-password"
            erreur={erreurs.motDePasse}
            value={motDePasse}
            onChange={(e) => {
              setMotDePasse(e.target.value);
              effacer('motDePasse');
            }}
          />
          {erreur !== null && (
            <Banner variante="danger" titre="Changement refusé">
              {messageErreur(erreur)}
            </Banner>
          )}
          <Button type="submit" variante="primary" bloc disabled={enCours}>
            Recevoir un lien
          </Button>
        </Formulaire>
      )}
      <LienDiscret vers={CHEMINS.reglages}>Retour aux réglages</LienDiscret>
    </>
  );
}
