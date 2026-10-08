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
  /** Envoyé en JSON. */
  corps?: unknown;
  /** Route publique : ni Bearer ni rafraîchissement. */
  publique?: boolean;
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

  async connecter(email: string, motDePasse: string): Promise<void> {
    const reponse = await this.envoyer('/api/auth/login', { methode: 'POST', corps: { email, password: motDePasse } });
    this.jeton = ((await reponse.json()) as { access_token: string }).access_token;
  }

  /** Efface le jeton en mémoire (session fermée par ailleurs, par exemple après un nouveau mot de passe). */
  oublier(): void {
    this.jeton = null;
  }

  /** Obtient un jeton neuf avec le ticket ; partage le rafraîchissement en cours. */
  rafraichir(): Promise<IssueRafraichissement> {
    this.rafraichissement ??= this.executerRafraichissement().finally(() => {
      this.rafraichissement = null;
    });
    return this.rafraichissement;
  }

  /** Appelle l'API ; renvoie le corps JSON, ou undefined pour une réponse sans contenu. */
  async requete<T = unknown>(chemin: string, options: OptionsRequete = {}): Promise<T> {
    if (options.publique) return lire<T>(await this.envoyer(chemin, options));

    if (this.jeton === null) await this.exigerSession();
    const utilise = this.jeton;
    try {
      return lire<T>(await this.envoyer(chemin, options, utilise));
    } catch (erreur) {
      if (!(erreur instanceof ErreurApi && erreur.code === 'INVALID_ACCESS_TOKEN')) throw erreur;
    }
    // Jeton refusé : rafraîchir, sauf si une autre requête l'a déjà fait entre-temps.
    if (this.jeton === utilise) await this.exigerSession();
    return lire<T>(await this.envoyer(chemin, options, this.jeton));
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
    if (options.corps !== undefined) entetes.set('Content-Type', 'application/json');

    let reponse: Response;
    try {
      reponse = await fetch(chemin, {
        method: options.methode ?? 'GET',
        headers: entetes,
        body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
        credentials: 'same-origin',
      });
    } catch {
      throw new ErreurReseau();
    }
    if (reponse.ok) return reponse;

    const corps = (await reponse.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
    const { code, message } = corps?.error ?? {};
    const delai = Number(reponse.headers.get('Retry-After') ?? Number.NaN);
    if (typeof code !== 'string' || typeof message !== 'string') {
      throw new ErreurApi(reponse.status, 'UNEXPECTED_RESPONSE', `Réponse inattendue (code ${reponse.status}).`);
    }
    throw new ErreurApi(reponse.status, code, message, Number.isFinite(delai) ? delai : undefined);
  }
}

async function lire<T>(reponse: Response): Promise<T> {
  if (reponse.status === 204) return undefined as T;
  return (await reponse.json()) as T;
}

/** Texte affichable d'une erreur reçue d'un appel au client. */
export function messageErreur(erreur: unknown): string {
  return erreur instanceof ErreurApi || erreur instanceof ErreurReseau ? erreur.message : 'Erreur inattendue. Réessayer.';
}
