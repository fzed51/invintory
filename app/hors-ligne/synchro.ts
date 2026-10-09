import { ErreurApi, type ClientApi } from '../session/clientApi.ts';
import type { BaseHorsLigne, Correspondance } from './base.ts';
import { MIGRATIONS, migrer, VERSION_MUTATIONS, type EntreeFile, type Migration, type Mutation } from './mutations.ts';

/** Session ouverte sur un autre compte que celui de la base : rien ne doit passer de l'une à l'autre. */
export class ErreurCompte extends Error {
  constructor() {
    super('La session ouverte n’est pas celle de ce compte.');
    this.name = 'ErreurCompte';
  }
}

/** Compte rendu d'une synchronisation. */
export type Bilan = {
  /** Mutations appliquées par le serveur (ou déjà reçues), retirées de la file. */
  envoyees: number;
  /** Mutations et photos refusées pour de bon, retirées et consignées dans `rejets`. */
  rejetees: number;
  /** Mutations restées en file. */
  enAttente: number;
  /** Photos envoyées. */
  photos: number;
};

type ResultatSync = {
  client_ref: string;
  status: 'applied' | 'already_applied' | 'rejected';
  bottles?: { client_ref: string; id: number; reference: string }[];
  error?: { code: string; message: string };
};

type Envoi = { entree: EntreeFile; mutation: Mutation };

export type OptionsSynchro = { migrations?: Readonly<Record<number, Migration>>; version?: number };

/** Contrat §10.1. */
const TAILLE_LOT = 200;
/** Rejets après lesquels la mutation reste en file (contrat §10.3). */
const A_GARDER = new Set(['BOTTLE_NOT_FOUND', 'UNSUPPORTED_SCHEMA_VERSION']);
/** Refus d'une photo qu'un nouvel envoi ne changerait pas (contrat §11). */
const PHOTO_REFUSEE = new Set([400, 413, 415]);

/**
 * Moteur de synchronisation (Arch §4) : envoie la file à `POST /api/sync` (ajouts d'abord,
 * lots de 200), puis les photos en attente. Une seule passe à la fois dans l'onglet ; entre
 * onglets, sous un verrou Web Locks quand le navigateur l'offre. Tout ce qui n'a pas reçu de
 * réponse reste en file : le renvoi est sans risque, le serveur reconnaît les `client_ref`.
 */
export class Synchroniseur {
  private readonly client: ClientApi;
  private readonly base: BaseHorsLigne;
  private readonly migrations: Readonly<Record<number, Migration>>;
  private readonly version: number;
  private enCours: Promise<Bilan> | null = null;
  private aRefaire = false;

  constructor(client: ClientApi, base: BaseHorsLigne, options: OptionsSynchro = {}) {
    this.client = client;
    this.base = base;
    this.migrations = options.migrations ?? MIGRATIONS;
    this.version = options.version ?? VERSION_MUTATIONS;
  }

  /**
   * Met une mutation en file et lance l'envoi (même en ligne, tout passe par la file : contrat
   * §2). `photo` : photo commune d'un ajout, envoyée sous le `client_ref` de la mutation.
   */
  async ajouter(mutation: Mutation, photo?: Blob): Promise<string> {
    const client_ref = crypto.randomUUID();
    await this.base.transaction('rw', this.base.file, this.base.photos, async () => {
      await this.base.file.add({ client_ref, schemaVersion: this.version, mutation });
      if (photo !== undefined) await this.base.photos.put({ client_ref, blob: photo });
    });
    this.relancer();
    return client_ref;
  }

  /** Met en attente la photo d'une bouteille (remplace la précédente) et lance l'envoi. */
  async ajouterPhoto(client_ref: string, photo: Blob): Promise<void> {
    await this.base.photos.put({ client_ref, blob: photo });
    this.relancer();
  }

  /** Synchronise maintenant, puis au retour du réseau ; renvoie la fonction d'arrêt. */
  demarrer(): () => void {
    const relancer = () => this.relancer();
    window.addEventListener('online', relancer);
    relancer();
    return () => window.removeEventListener('online', relancer);
  }

  /**
   * Envoie la file et les photos. Appelée pendant une passe, elle en demande une de plus
   * (ce qui a été mis en file entre-temps) et partage son résultat.
   */
  synchroniser(): Promise<Bilan> {
    if (this.enCours !== null) {
      this.aRefaire = true;
      return this.enCours;
    }
    this.enCours = this.verrouiller(async () => {
      const bilan: Bilan = { envoyees: 0, rejetees: 0, enAttente: 0, photos: 0 };
      do {
        this.aRefaire = false;
        await this.passe(bilan);
      } while (this.aRefaire);
      bilan.enAttente = await this.base.file.count();
      return bilan;
    }).finally(() => {
      this.enCours = null;
    });
    return this.enCours;
  }

  /** Lancement sans attente : l'échec (hors ligne) laisse tout en file pour le prochain déclencheur. */
  private relancer(): void {
    this.synchroniser().catch(() => undefined);
  }

  private async verrouiller(passe: () => Promise<Bilan>): Promise<Bilan> {
    if (!('locks' in navigator)) return passe();
    return await navigator.locks.request(`${this.base.name}-synchro`, passe);
  }

  private async passe(bilan: Bilan): Promise<void> {
    const entrees = await this.base.file.orderBy('ordre').toArray();
    const envois: Envoi[] = [];
    for (const entree of entrees) {
      const mutation = migrer(entree, this.migrations, this.version);
      if (mutation !== null) envois.push({ entree, mutation });
    }
    if (envois.length === 0 && (await this.base.photos.count()) === 0) return;
    if ((await this.client.compteConnecte()) !== this.base.compte) throw new ErreurCompte();

    // Ajouts d'abord (tri stable) : un mouvement ne part jamais avant la création de sa bouteille.
    envois.sort((a, b) => Number(b.mutation.kind === 'add') - Number(a.mutation.kind === 'add'));
    const abandonnees = new Set<string>();
    for (let debut = 0; debut < envois.length; debut += TAILLE_LOT) {
      const lot = envois.slice(debut, debut + TAILLE_LOT);
      const { results } = await this.client.requete<{ results: ResultatSync[] }>('/api/sync', {
        methode: 'POST',
        corps: {
          mutations: lot.map(({ entree, mutation }) => ({
            client_ref: entree.client_ref,
            schema_version: this.version,
            ...mutation,
          })),
        },
      });
      for (const [i, envoi] of lot.entries()) {
        const resultat = results[i];
        if (resultat?.client_ref !== envoi.entree.client_ref) throw new Error('Réponse de synchronisation incohérente.');
        if (!abandonnees.has(resultat.client_ref)) await this.traiter(envoi, resultat, bilan, abandonnees);
      }
    }
    await this.envoyerPhotos(bilan);
  }

  private async traiter(envoi: Envoi, resultat: ResultatSync, bilan: Bilan, abandonnees: Set<string>): Promise<void> {
    const { entree, mutation } = envoi;
    if (resultat.status !== 'rejected') {
      await this.base.transaction('rw', this.base.file, this.base.correspondances, async () => {
        await this.base.file.delete(entree.ordre!);
        const correspondances: Correspondance[] = (resultat.bottles ?? []).map(({ client_ref, id, reference }) => ({
          client_ref,
          id,
          reference,
        }));
        await this.base.correspondances.bulkPut(correspondances);
      });
      bilan.envoyees++;
      return;
    }

    const { code, message } = resultat.error ?? { code: 'UNEXPECTED_RESPONSE', message: 'Refus sans motif.' };
    if (A_GARDER.has(code)) return;

    const rejeteLe = new Date().toISOString();
    await this.base.transaction('rw', this.base.file, this.base.photos, this.base.rejets, async () => {
      await this.base.file.delete(entree.ordre!);
      await this.base.rejets.add({ client_ref: entree.client_ref, kind: mutation.kind, code, message, rejeteLe });
      abandonnees.add(entree.client_ref);
      bilan.rejetees++;
      if (mutation.kind !== 'add') return;

      // Bouteilles jamais créées : leur photo et leurs mouvements ne pourront jamais partir.
      const bouteilles = mutation.bottles.map((b) => b.client_ref);
      await this.base.photos.bulkDelete([entree.client_ref, ...bouteilles]);
      for (const dependante of await this.base.file.toArray()) {
        const m = migrer(dependante, this.migrations, this.version);
        if (m === null || m.kind === 'add' || !bouteilles.includes(m.bottle)) continue;
        await this.base.file.delete(dependante.ordre!);
        await this.base.rejets.add({
          client_ref: dependante.client_ref,
          kind: m.kind,
          code: 'ADD_REJECTED',
          message: 'Ajout de la bouteille refusé.',
          rejeteLe,
        });
        abandonnees.add(dependante.client_ref);
        bilan.rejetees++;
      }
    });
  }

  /** Photos dont la bouteille (ou le lot) n'attend plus dans la file : 404 → réessayée plus tard. */
  private async envoyerPhotos(bilan: Bilan): Promise<void> {
    const enFile = new Set<string>();
    for (const entree of await this.base.file.toArray()) {
      enFile.add(entree.client_ref);
      const { bottles } = (entree.mutation ?? {}) as { bottles?: unknown };
      if (Array.isArray(bottles)) bottles.forEach((b: { client_ref?: string }) => b.client_ref && enFile.add(b.client_ref));
    }

    for (const { client_ref, blob } of await this.base.photos.toArray()) {
      if (enFile.has(client_ref)) continue;
      try {
        await this.client.requete(`/api/photos/${client_ref}`, { methode: 'PUT', corps: blob });
      } catch (erreur) {
        if (!(erreur instanceof ErreurApi)) throw erreur;
        if (erreur.statut === 404) continue;
        if (!PHOTO_REFUSEE.has(erreur.statut)) throw erreur;
        await this.base.transaction('rw', this.base.photos, this.base.rejets, async () => {
          await this.base.photos.delete(client_ref);
          await this.base.rejets.add({
            client_ref,
            kind: 'photo',
            code: erreur.code,
            message: erreur.message,
            rejeteLe: new Date().toISOString(),
          });
        });
        bilan.rejetees++;
        continue;
      }
      await this.base.photos.delete(client_ref);
      bilan.photos++;
    }
  }
}
