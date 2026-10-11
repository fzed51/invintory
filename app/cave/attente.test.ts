import { describe, expect, it } from 'vitest';
import type { Emplacement as Cible } from '../hors-ligne/mutations.ts';
import { BOUTEILLES, CAVE, FICHE } from '../test/cave.ts';
import { messageComplet, places, superposerCave, superposerFiche, suggestion, type EnAttente } from './attente.ts';

const ETAGERE_1 = { type: 'etagere', id: 12, cabinet_id: 3, label: 'Cave du bas · Étagère 1' } as const;
const MAGNUMS = { type: 'etagere', id: 13, cabinet_id: 3, label: 'Cave du bas · Magnums' } as const;
const CARTON = { type: 'carton', id: 4, label: 'Carton Bordeaux' } as const;
const HORS = { type: 'hors_rangement' } as const;

const deplacer = (bottle: string, location: Cible): EnAttente => ({
  client_ref: `dep-${bottle}-${JSON.stringify(location)}`,
  mutation: { kind: 'move', occurred_at: '2026-10-10T12:00:00.000Z', bottle, location },
});
const sortir = (bottle: string): EnAttente => ({
  client_ref: `sortie-${bottle}`,
  mutation: { kind: 'exit', occurred_at: '2026-10-10T13:00:00.000Z', bottle, exit_reason: 'consommee' },
});

describe('Superposition des mouvements en attente sur la cave', () => {
  it('sans attente : la lecture telle quelle', () => {
    const lue = superposerCave({ cave: CAVE, bouteilles: BOUTEILLES }, []);
    expect(lue.cave).toEqual(CAVE);
    expect(lue.bouteilles).toEqual(BOUTEILLES);
  });

  it('déplacement vers Hors rangement : emplacement de la bouteille et compteurs', () => {
    const { cave, bouteilles } = superposerCave({ cave: CAVE, bouteilles: BOUTEILLES }, [deplacer('ref-41', HORS)]);
    expect(bouteilles.find((b) => b.id === 41)?.location).toEqual(HORS);
    expect(cave.cabinets[0].shelves[0].occupied).toBe(1);
    expect(cave.unplaced).toBe(2);
  });

  it('déplacement vers une étagère ou un carton : libellé de l’emplacement, compteurs', () => {
    const { cave, bouteilles } = superposerCave({ cave: CAVE, bouteilles: BOUTEILLES }, [
      deplacer('ref-44', { type: 'etagere', id: 13 }),
      deplacer('ref-41', { type: 'carton', id: 4 }),
    ]);
    expect(bouteilles.find((b) => b.id === 44)?.location).toEqual(MAGNUMS);
    expect(bouteilles.find((b) => b.id === 41)?.location).toEqual(CARTON);
    expect(cave.cabinets[0].shelves.map((e) => e.occupied)).toEqual([1, 1]);
    expect(cave.boxes[0].occupied).toBe(2);
    expect(cave.unplaced).toBe(0);
  });

  it('sortie : bouteille retirée de la cave, place libérée', () => {
    const { cave, bouteilles } = superposerCave({ cave: CAVE, bouteilles: BOUTEILLES }, [sortir('ref-43')]);
    expect(bouteilles.map((b) => b.id)).toEqual([41, 42, 44]);
    expect(cave.boxes[0].occupied).toBe(0);
  });

  it('mouvements appliqués dans l’ordre de la file', () => {
    const { cave, bouteilles } = superposerCave({ cave: CAVE, bouteilles: BOUTEILLES }, [
      deplacer('ref-41', HORS),
      deplacer('ref-41', { type: 'etagere', id: 13 }),
      sortir('ref-41'),
    ]);
    expect(bouteilles.some((b) => b.id === 41)).toBe(false);
    expect(cave.cabinets[0].shelves.map((e) => e.occupied)).toEqual([1, 0]);
    expect(cave.unplaced).toBe(1);
  });

  it('déjà reflété par le serveur (relu avant le retrait de la file) : rien ne bouge deux fois', () => {
    const { cave } = superposerCave({ cave: CAVE, bouteilles: BOUTEILLES }, [deplacer('ref-44', HORS)]);
    expect(cave).toEqual(CAVE);
  });

  it('bouteille inconnue de la copie : mouvement ignoré', () => {
    const lue = superposerCave({ cave: CAVE, bouteilles: BOUTEILLES }, [deplacer('inconnue', HORS), sortir('autre')]);
    expect(lue.cave).toEqual(CAVE);
    expect(lue.bouteilles).toEqual(BOUTEILLES);
  });

  it('emplacement complet ou disparu : Hors rangement, comme le serveur (contrat §10.4)', () => {
    const plein = { ...CAVE, boxes: [{ ...CAVE.boxes[0], occupied: 6 }] };
    const { bouteilles } = superposerCave({ cave: plein, bouteilles: BOUTEILLES }, [
      deplacer('ref-41', { type: 'carton', id: 4 }),
      deplacer('ref-42', { type: 'etagere', id: 99 }),
    ]);
    expect(bouteilles.find((b) => b.id === 41)?.location).toEqual(HORS);
    expect(bouteilles.find((b) => b.id === 42)?.location).toEqual(HORS);
  });

  it('ne modifie pas la lecture reçue', () => {
    const copie = structuredClone({ cave: CAVE, bouteilles: BOUTEILLES });
    superposerCave(copie, [deplacer('ref-41', HORS), sortir('ref-43')]);
    expect(copie).toEqual({ cave: CAVE, bouteilles: BOUTEILLES });
  });
});

describe('Superposition sur la fiche', () => {
  const { movements, ...bouteille } = FICHE;

  it('déplacement puis sortie en attente : état de la bouteille et lignes d’historique en attente', () => {
    const fiche = superposerFiche(bouteille, CAVE, [deplacer('ref-41', { type: 'etagere', id: 13 }), sortir('ref-41')]);
    expect(fiche.bouteille.status).toBe('sortie');
    expect(fiche.enAttente).toEqual([
      {
        client_ref: 'dep-ref-41-{"type":"etagere","id":13}',
        type: 'deplacement',
        exit_reason: null,
        from: ETAGERE_1,
        to: MAGNUMS,
        occurred_at: '2026-10-10T12:00:00.000Z',
      },
      {
        client_ref: 'sortie-ref-41',
        type: 'sortie',
        exit_reason: 'consommee',
        from: MAGNUMS,
        to: null,
        occurred_at: '2026-10-10T13:00:00.000Z',
      },
    ]);
    expect(movements).toHaveLength(2);
  });

  it('mouvements d’autres bouteilles ignorés', () => {
    const fiche = superposerFiche(bouteille, CAVE, [deplacer('ref-42', HORS)]);
    expect(fiche.bouteille).toEqual(bouteille);
    expect(fiche.enAttente).toEqual([]);
  });

  it('sans copie de la cave : destination « Hors rangement » gardée, autre libellé inconnu', () => {
    const fiche = superposerFiche(bouteille, null, [deplacer('ref-41', { type: 'carton', id: 4 })]);
    expect(fiche.bouteille.location).toEqual({ type: 'carton', id: 4, label: 'Emplacement en attente' });
    expect(superposerFiche(bouteille, null, [deplacer('ref-41', HORS)]).bouteille.location).toEqual(HORS);
  });
});

describe('Places et suggestion (CdC §3.2, contrat §5)', () => {
  it('places dans l’ordre du serveur : étagères, puis cartons, avec la place libre', () => {
    expect(places(CAVE).map(({ location, libres }) => [location, libres])).toEqual([
      [ETAGERE_1, 10],
      [MAGNUMS, 4],
      [CARTON, 5],
    ]);
  });

  it('première place libre, hors emplacement actuel de la bouteille', () => {
    expect(suggestion(CAVE, HORS, 0)).toEqual({ place: places(CAVE)[0], candidates: 3 });
    expect(suggestion(CAVE, ETAGERE_1, 0).place?.location).toEqual(MAGNUMS);
  });

  it('« Autre emplacement » : la suivante, puis retour à la première', () => {
    expect(suggestion(CAVE, HORS, 1).place?.location).toEqual(MAGNUMS);
    expect(suggestion(CAVE, HORS, 2).place?.location).toEqual(CARTON);
    expect(suggestion(CAVE, HORS, 3).place?.location).toEqual(ETAGERE_1);
  });

  it('places complètes écartées ; aucune libre → pas de suggestion', () => {
    const pleine = {
      ...CAVE,
      cabinets: [{ ...CAVE.cabinets[0], shelves: CAVE.cabinets[0].shelves.map((e) => ({ ...e, occupied: e.capacity })) }],
    };
    expect(suggestion(pleine, HORS, 0).place?.location).toEqual(CARTON);
    const toutePleine = { ...pleine, boxes: [{ ...CAVE.boxes[0], occupied: 6 }] };
    expect(suggestion(toutePleine, HORS, 0)).toEqual({ place: null, candidates: 0 });
  });

  it('refus d’un emplacement complet : la règle et le maximum (DS)', () => {
    expect(messageComplet({ location: ETAGERE_1, capacite: 12, occupees: 12, libres: 0 })).toBe(
      'Étagère complète : 12 alvéoles sur 12 sont occupées. Choisissez un autre emplacement.',
    );
    expect(messageComplet({ location: CARTON, capacite: 6, occupees: 6, libres: 0 })).toBe(
      'Carton complet : 6 bouteilles sur 6 sont rangées. Choisissez un autre emplacement.',
    );
  });
});
