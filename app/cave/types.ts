import type { WineType } from '../design/wine-types.ts';

// Formes de l'API (contrat §5 et §7.1), champs JSON en anglais.

export type Etagere = { id: number; name: string | null; position: number; capacity: number; occupied: number };
export type Armoire = { id: number; name: string; shelves: Etagere[] };
export type Carton = { id: number; label: string; capacity: number; occupied: number };
/** `GET /api/cellar`. */
export type Cave = { cabinets: Armoire[]; boxes: Carton[]; unplaced: number };

export type Emplacement =
  | { type: 'etagere'; id: number; cabinet_id: number; label: string }
  | { type: 'carton'; id: number; label: string }
  | { type: 'hors_rangement' };

export type Bouteille = {
  id: number;
  client_ref: string;
  reference: string;
  type: WineType;
  region: { id: number; name: string } | null;
  grape: { id: number; name: string } | null;
  domain: string | null;
  vintage: number | null;
  entry_date: string;
  origin: string;
  note: string | null;
  souvenir: boolean;
  location: Emplacement;
  status: 'en_cave' | 'sortie';
  drink_by: string;
  urgent: boolean;
  age_year: number;
  batch_id: string | null;
  has_photo: boolean;
  created_at: string;
  updated_at: string;
};

/** Mouvement d'une bouteille (contrat §8), lu avec sa fiche. */
export type Mouvement = {
  id: number;
  client_ref: string;
  type: 'entree' | 'deplacement' | 'sortie';
  exit_reason: 'consommee' | 'offerte' | 'perdue_cassee' | null;
  from: Emplacement | null;
  to: Emplacement | null;
  occurred_at: string;
};

/** `GET /api/bottles/{id}` : la bouteille et son historique. */
export type Fiche = Bouteille & { movements: Mouvement[] };
