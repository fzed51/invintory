import type { WineType } from '../design/wine-types.ts';

/** Version de la forme des mutations écrites par ce code (contrat §10.1, `schema_version`). */
export const VERSION_MUTATIONS = 1;

/** Emplacement visé (contrat §1.5, en entrée : `type` et `id`). */
export type Emplacement = { type: 'etagere' | 'carton'; id: number } | { type: 'hors_rangement' };

export type ChampsAjout = {
  type: WineType;
  entry_date: string;
  origin: 'achetee' | 'offerte';
  region?: string | null;
  grape?: string | null;
  domain?: string | null;
  vintage?: number | null;
  note?: string | null;
  souvenir?: boolean;
};

/** Mutations de la version courante, sans `client_ref` ni `schema_version` (portés par l'entrée de file). */
export type Mutation =
  | {
      kind: 'add';
      occurred_at: string;
      bottles: { client_ref: string; reference?: string }[];
      fields: ChampsAjout;
      location: Emplacement;
    }
  | { kind: 'move'; occurred_at: string; bottle: string; location: Emplacement }
  | { kind: 'exit'; occurred_at: string; bottle: string; exit_reason: 'consommee' | 'offerte' | 'perdue_cassee' };

/** Entrée de la file : la mutation garde la forme de la version qui l'a écrite. */
export type EntreeFile = {
  /** Clé croissante attribuée à l'insertion : ordre d'envoi. */
  ordre?: number;
  client_ref: string;
  schemaVersion: number;
  mutation: unknown;
};

/** Passe une mutation de la version N à N+1. */
export type Migration = (mutation: unknown) => unknown;

/**
 * Chaîne de migration, indexée par la version de départ (Arch §4.2). Vide tant que la v1 est
 * la seule forme : une évolution ajoute ici `1: (m) => …` et passe VERSION_MUTATIONS à 2.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/**
 * Forme courante d'une entrée de file, migrée étape par étape sans toucher à l'entrée ; null
 * si ce code ne sait pas l'envoyer (version plus récente, écrite par un onglet déjà à jour, ou
 * maillon de chaîne manquant) : elle reste en file.
 */
export function migrer(
  entree: EntreeFile,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  courante = VERSION_MUTATIONS,
): Mutation | null {
  const depart = entree.schemaVersion;
  if (!Number.isInteger(depart) || depart < 1 || depart > courante) return null;
  let mutation = entree.mutation;
  for (let version = depart; version < courante; version++) {
    const etape = migrations[version];
    if (etape === undefined) return null;
    mutation = etape(mutation);
  }
  return mutation as Mutation;
}
