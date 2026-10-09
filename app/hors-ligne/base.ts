import Dexie, { type EntityTable } from 'dexie';
import type { EntreeFile } from './mutations.ts';

/** Dernière réponse reçue d'une route de lecture (cache hors ligne). */
export type Lecture = { route: string; corps: unknown; recueLe: string };

/** Photo en attente d'envoi : `client_ref` d'une bouteille, ou d'un ajout pour la photo du lot. */
export type PhotoEnAttente = { client_ref: string; blob: Blob };

/** Identité serveur d'une bouteille créée par la file (réponse de `/sync`). */
export type Correspondance = { client_ref: string; id: number; reference: string };

/** Mutation ou photo abandonnée après un refus définitif, gardée pour être signalée. */
export type Rejet = {
  id?: number;
  client_ref: string;
  kind: string;
  code: string;
  message: string;
  rejeteLe: string;
};

/**
 * Base IndexedDB d'un compte (une par compte : la file d'un compte ne part jamais avec la
 * session d'un autre). Le cache de lecture se reconstruit depuis le serveur : une version
 * future de la base le vide plutôt que de le migrer (Arch §4.2).
 */
export class BaseHorsLigne extends Dexie {
  declare lectures: EntityTable<Lecture, 'route'>;
  declare file: EntityTable<EntreeFile, 'ordre'>;
  declare photos: EntityTable<PhotoEnAttente, 'client_ref'>;
  declare correspondances: EntityTable<Correspondance, 'client_ref'>;
  declare rejets: EntityTable<Rejet, 'id'>;
  readonly compte: string;

  constructor(compte: string) {
    super(`invintory-${compte}`);
    this.compte = compte;
    this.version(1).stores({
      lectures: '&route',
      file: '++ordre, &client_ref',
      photos: '&client_ref',
      correspondances: '&client_ref',
      rejets: '++id',
    });
  }
}
