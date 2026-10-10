import { nomAppareil } from './appareil.ts';

/** Refus de l'API, d'après l'enveloppe `{"error": {"code", "message"}}` (contrat §1.3). */
export class ErreurApi extends Error {
  readonly statut: number;
  readonly code: string;
  /** Délai en secondes de l'en-tête Retry-After, s'il est donné. */
  readonly reessayerApres?: number;

  constructor(statut: number, code: string, message: string, reessayerApres?: number) {
    super(message);
    this.name = 'ErreurApi';
    this.statut = statut;
    this.code = code;
    this.reessayerApres = reessayerApres;
  }
}

/** Serveur injoignable (hors ligne, coupure) : rien n'est conclu sur la session. */
export class ErreurReseau extends Error {
  constructor() {
    super('Connexion au serveur impossible. Vérifier le réseau.');
    this.name = 'ErreurReseau';
  }
}

export type IssueRafraichissement = 'connectee' | 'deconnectee';

export type OptionsRequete = {
  methode?: string;
  /** Envoyé tel quel s'il s'agit d'un Blob (photo), en JSON sinon. */
  corps?: unknown;
  /** Route publique : ni Bearer ni rafraîchissement. */
  publique?: boolean;
  /** `blob` : corps de la réponse rendu tel quel (photo), au lieu du JSON. */
  format?: 'json' | 'blob';
};

/** Refus du rafraîchissement qui terminent la session (contrat §3). */
const FIN_DE_SESSION = ['SESSION_INVALID', 'ACCESS_REVOKED'];

/**
 * Client de l'API (décision P3) : le jeton d'accès reste en mémoire ; le ticket de session
 * est un cookie HttpOnly que seul le navigateur manipule. Un seul rafraîchissement à la fois
 * dans l'onglet : les requêtes qui en ont besoin attendent le même.
 */
export class ClientApi {
  private jeton: string | null = null;
  private rafraichissement: Promise<IssueRafraichissement> | null = null;
  private readonly abonnes = new Set<() => void>();
  /** Refus qui a terminé la session, relancé aux requêtes suivantes. */
  private derniereFin = new ErreurApi(401, 'SESSION_INVALID', 'Session expirée. Reconnectez-vous.');

  /** Prévient quand la session est terminée côté serveur (reconnexion requise). */
  surDeconnexion(abonne: () => void): () => void {
    this.abonnes.add(abonne);
    return () => this.abonnes.delete(abonne);
  }

  /** Connexion ; le nom de l'appareil détecté accompagne les identifiants, s'il est reconnu. */
  async connecter(email: string, motDePasse: string): Promise<void> {
    const device = nomAppareil(navigator.userAgent);
    const corps = { email, password: motDePasse, ...(device !== null && { device }) };
    const reponse = await this.envoyer('/api/auth/login', { methode: 'POST', corps });
    this.jeton = ((await reponse.json()) as { access_token: string }).access_token;
  }

  /** Efface le jeton en mémoire (session fermée par ailleurs, par exemple après un nouveau mot de passe). */
  oublier(): void {
    this.jeton = null;
  }

  /**
   * Compte du jeton en mémoire (`sub`, lu sans vérification : sert à choisir la base locale,
   * pas à authentifier) ; null sans jeton ou si le jeton n'en porte pas.
   */
  compte(): string | null {
    const charge = this.jeton?.split('.')[1];
    if (charge === undefined) return null;
    try {
      const { sub } = JSON.parse(atob(charge.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
      return typeof sub === 'string' && sub !== '' ? sub : null;
    } catch {
      return null;
    }
  }

  /** Compte de la session, après un rafraîchissement si aucun jeton n'est en mémoire. */
  async compteConnecte(): Promise<string | null> {
    if (this.jeton === null) await this.exigerSession();
    return this.compte();
  }

  /** Obtient un jeton neuf avec le ticket ; partage le rafraîchissement en cours. */
  rafraichir(): Promise<IssueRafraichissement> {
    this.rafraichissement ??= this.executerRafraichissement().finally(() => {
      this.rafraichissement = null;
    });
    return this.rafraichissement;
  }

  /** Appelle l'API ; renvoie le corps JSON (ou Blob), ou undefined pour une réponse sans contenu. */
  async requete<T = unknown>(chemin: string, options: OptionsRequete = {}): Promise<T> {
    if (options.publique) return lire<T>(await this.envoyer(chemin, options), options.format);

    if (this.jeton === null) await this.exigerSession();
    const utilise = this.jeton;
    try {
      return lire<T>(await this.envoyer(chemin, options, utilise), options.format);
    } catch (erreur) {
      if (!(erreur instanceof ErreurApi && erreur.code === 'INVALID_ACCESS_TOKEN')) throw erreur;
    }
    // Jeton refusé : rafraîchir, sauf si une autre requête l'a déjà fait entre-temps.
    if (this.jeton === utilise) await this.exigerSession();
    return lire<T>(await this.envoyer(chemin, options, this.jeton), options.format);
  }

  private async exigerSession(): Promise<void> {
    if ((await this.rafraichir()) === 'deconnectee') throw this.derniereFin;
  }

  private async executerRafraichissement(): Promise<IssueRafraichissement> {
    for (let essai = 1; ; essai++) {
      try {
        const reponse = await this.envoyer('/api/auth/refresh', { methode: 'POST' });
        this.jeton = ((await reponse.json()) as { access_token: string }).access_token;
        return 'connectee';
      } catch (erreur) {
        // Ticket renouvelé à l'instant par un autre onglet : le cookie est déjà le nouveau.
        if (erreur instanceof ErreurApi && erreur.code === 'SESSION_ALREADY_REFRESHED' && essai === 1) continue;
        if (erreur instanceof ErreurApi && FIN_DE_SESSION.includes(erreur.code)) {
          this.jeton = null;
          this.derniereFin = erreur;
          this.abonnes.forEach((abonne) => abonne());
          return 'deconnectee';
        }
        throw erreur;
      }
    }
  }

  /** Envoie la requête ; lève ErreurReseau ou ErreurApi, renvoie la réponse si elle est un succès. */
  private async envoyer(chemin: string, options: OptionsRequete, jeton: string | null = null): Promise<Response> {
    const entetes = new Headers();
    if (jeton !== null) entetes.set('Authorization', `Bearer ${jeton}`);
    const { corps } = options;
    if (corps instanceof Blob) entetes.set('Content-Type', corps.type);
    else if (corps !== undefined) entetes.set('Content-Type', 'application/json');

    let reponse: Response;
    try {
      reponse = await fetch(chemin, {
        method: options.methode ?? 'GET',
        headers: entetes,
        body: corps === undefined || corps instanceof Blob ? corps : JSON.stringify(corps),
        credentials: 'same-origin',
      });
    } catch {
      throw new ErreurReseau();
    }
    if (reponse.ok) return reponse;

    const enveloppe = (await reponse.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
    const { code, message } = enveloppe?.error ?? {};
    const delai = Number(reponse.headers.get('Retry-After') ?? Number.NaN);
    if (typeof code !== 'string' || typeof message !== 'string') {
      throw new ErreurApi(reponse.status, 'UNEXPECTED_RESPONSE', `Réponse inattendue (code ${reponse.status}).`);
    }
    throw new ErreurApi(reponse.status, code, message, Number.isFinite(delai) ? delai : undefined);
  }
}

async function lire<T>(reponse: Response, format: OptionsRequete['format'] = 'json'): Promise<T> {
  if (reponse.status === 204) return undefined as T;
  return (format === 'blob' ? await reponse.blob() : await reponse.json()) as T;
}

/** Texte affichable d'une erreur reçue d'un appel au client. */
export function messageErreur(erreur: unknown): string {
  return erreur instanceof ErreurApi || erreur instanceof ErreurReseau ? erreur.message : 'Erreur inattendue. Réessayer.';
}
