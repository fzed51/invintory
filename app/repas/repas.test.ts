import { describe, expect, it } from 'vitest';
import type { Bouteille } from '../cave/types.ts';
import { bouteille } from '../test/cave.ts';
import { AUCUN_FILTRE, filtrerRepas, optionsRepas, trierRepas } from './repas.ts';

const HORS = { type: 'hors_rangement' } as const;

/** Bouteille d'un ajout en attente : date limite inconnue (calculée par le serveur), `id` 0. */
const enAttente = (reference: string, champs: Partial<Bouteille> = {}) =>
  bouteille(0, reference, HORS, { client_ref: `att-${reference}`, drink_by: '', enAttente: true, ...champs });

const refs = (bouteilles: Bouteille[]) => bouteilles.map((b) => b.reference);

describe('filtrerRepas (CdC §3.6 : type + région + cépage)', () => {
  const cave = [
    bouteille(1, 'a2', HORS, { type: 'rouge', region: { id: 5, name: 'Bordeaux' }, grape: { id: 9, name: 'Merlot' } }),
    bouteille(2, 'a3', HORS, { type: 'blanc', region: { id: 6, name: 'Alsace' }, grape: { id: 7, name: 'Riesling' } }),
    bouteille(3, 'a4', HORS, { type: 'rouge', region: { id: 6, name: 'Alsace' }, grape: null }),
    bouteille(4, 'a5', HORS, { type: 'rouge', region: null, grape: { id: 9, name: 'Merlot' }, souvenir: true }),
  ];

  it('sans filtre : toutes les bouteilles en cave, souvenirs compris', () => {
    expect(refs(filtrerRepas(cave, AUCUN_FILTRE))).toEqual(['a2', 'a3', 'a4', 'a5']);
  });

  it('les trois filtres se combinent', () => {
    expect(refs(filtrerRepas(cave, { ...AUCUN_FILTRE, type: 'rouge' }))).toEqual(['a2', 'a4', 'a5']);
    expect(refs(filtrerRepas(cave, { ...AUCUN_FILTRE, type: 'rouge', region: 'Alsace' }))).toEqual(['a4']);
    expect(refs(filtrerRepas(cave, { type: 'rouge', region: null, cepage: 'Merlot' }))).toEqual(['a2', 'a5']);
    expect(refs(filtrerRepas(cave, { type: 'blanc', region: 'Bordeaux', cepage: null }))).toEqual([]);
  });

  it('région et cépage comparés sans tenir compte de la casse, mais des accents (comme la base)', () => {
    const lot = [
      bouteille(1, 'a2', HORS, { region: { id: 5, name: 'Rhône' } }),
      enAttente('a3', { region: { id: 0, name: 'rhône' } }),
      bouteille(3, 'a4', HORS, { region: { id: 8, name: 'Rhone' } }),
    ];

    expect(refs(filtrerRepas(lot, { ...AUCUN_FILTRE, region: 'Rhône' }))).toEqual(['a2', 'a3']);
  });

  it('les bouteilles sorties ne sont jamais proposées', () => {
    const lot = [bouteille(1, 'a2', HORS), bouteille(2, 'a3', HORS, { status: 'sortie' })];

    expect(refs(filtrerRepas(lot, AUCUN_FILTRE))).toEqual(['a2']);
  });
});

describe('optionsRepas : régions et cépages présents dans la cave', () => {
  it('valeurs distinctes, sans distinction de casse, triées dans l’ordre alphabétique français', () => {
    const lot = [
      bouteille(1, 'a2', HORS, { region: { id: 5, name: 'Bordeaux' }, grape: { id: 9, name: 'Merlot' } }),
      bouteille(2, 'a3', HORS, { region: { id: 6, name: 'Alsace' }, grape: null }),
      enAttente('a4', { region: { id: 0, name: 'bordeaux' }, grape: { id: 0, name: 'Éraldo' } }),
      bouteille(4, 'a5', HORS, { region: null, grape: { id: 3, name: 'Cabernet' } }),
      bouteille(5, 'a6', HORS, { region: { id: 7, name: 'Loire' }, status: 'sortie' }),
    ];

    expect(optionsRepas(lot)).toEqual({ regions: ['Alsace', 'Bordeaux'], cepages: ['Cabernet', 'Éraldo', 'Merlot'] });
  });
});

describe('trierRepas (CdC §3.6, contrat §7.2)', () => {
  it('à boire en priorité : date limite croissante (dépassées d’abord), puis âge, puis id', () => {
    const lot = [
      bouteille(1, 'a2', HORS, { drink_by: '2030-12-31', age_year: 2020 }),
      bouteille(2, 'a3', HORS, { drink_by: '2024-12-31', age_year: 2016, urgent: true }),
      bouteille(3, 'a4', HORS, { drink_by: '2030-12-31', age_year: 2015 }),
      bouteille(5, 'a6', HORS, { drink_by: '2027-12-31', age_year: 2019 }),
      bouteille(4, 'a5', HORS, { drink_by: '2027-12-31', age_year: 2019 }),
    ];

    expect(refs(trierRepas(lot, 'priorite'))).toEqual(['a3', 'a5', 'a6', 'a4', 'a2']);
  });

  it('à boire en priorité : un ajout en attente (date limite encore inconnue) vient après les autres', () => {
    const lot = [enAttente('a2', { age_year: 1990 }), bouteille(2, 'a3', HORS, { drink_by: '2040-12-31' })];

    expect(refs(trierRepas(lot, 'priorite'))).toEqual(['a3', 'a2']);
  });

  it('par âge : millésime ou année d’entrée croissant (les plus vieilles d’abord), puis id', () => {
    const lot = [
      bouteille(1, 'a2', HORS, { age_year: 2020 }),
      bouteille(3, 'a4', HORS, { age_year: 2012 }),
      bouteille(2, 'a3', HORS, { age_year: 2012 }),
      enAttente('a5', { age_year: 2001 }),
    ];

    expect(refs(trierRepas(lot, 'age'))).toEqual(['a5', 'a3', 'a4', 'a2']);
  });

  it('ne modifie pas la liste reçue', () => {
    const lot = [bouteille(1, 'a2', HORS, { age_year: 2020 }), bouteille(2, 'a3', HORS, { age_year: 2010 })];

    trierRepas(lot, 'age');

    expect(refs(lot)).toEqual(['a2', 'a3']);
  });
});
