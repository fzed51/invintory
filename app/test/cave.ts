import type { Bouteille, Cave } from '../cave/types.ts';

/** Cave de référence des tests : une armoire à deux étagères, un carton, une bouteille hors rangement. */
export const CAVE: Cave = {
  cabinets: [
    {
      id: 3,
      name: 'Cave du bas',
      shelves: [
        { id: 12, name: null, position: 1, capacity: 12, occupied: 2 },
        { id: 13, name: 'Magnums', position: 2, capacity: 4, occupied: 0 },
      ],
    },
  ],
  boxes: [{ id: 4, label: 'Carton Bordeaux', capacity: 6, occupied: 1 }],
  unplaced: 1,
};

/** Bouteille en cave, champs du contrat §7.1 ; seuls ceux utiles aux écrans varient. */
export function bouteille(
  id: number,
  reference: string,
  location: Bouteille['location'],
  champs: Partial<Bouteille> = {},
): Bouteille {
  return {
    id,
    client_ref: `ref-${id}`,
    reference,
    type: 'rouge',
    region: { id: 5, name: 'Bordeaux' },
    grape: null,
    domain: `Domaine ${reference}`,
    vintage: 2018,
    entry_date: '2026-10',
    origin: 'achetee',
    note: null,
    souvenir: false,
    location,
    status: 'en_cave',
    drink_by: '2026-12-31',
    urgent: false,
    age_year: 2018,
    batch_id: null,
    has_photo: false,
    created_at: '2026-10-07T18:42:05.000Z',
    updated_at: '2026-10-07T18:42:05.000Z',
    ...champs,
  };
}

export const BOUTEILLES: Bouteille[] = [
  bouteille(41, 'a7', { type: 'etagere', id: 12, cabinet_id: 3, label: 'Cave du bas · Étagère 1' }),
  bouteille(42, 'a8', { type: 'etagere', id: 12, cabinet_id: 3, label: 'Cave du bas · Étagère 1' }, { type: 'blanc' }),
  bouteille(43, 'b2', { type: 'carton', id: 4, label: 'Carton Bordeaux' }, { vintage: null, souvenir: true }),
  bouteille(44, 'c9', { type: 'hors_rangement' }, { urgent: true }),
];
