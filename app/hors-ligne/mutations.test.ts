import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrer, VERSION_MUTATIONS } from './mutations.ts';

/** Chaîne fictive v1 → v2 → v3 : chaque étape laisse sa trace dans la mutation. */
const CHAINE = {
  1: (m: unknown) => ({ ...(m as object), etapes: [...((m as { etapes?: number[] }).etapes ?? []), 1] }),
  2: (m: unknown) => ({ ...(m as object), etapes: [...((m as { etapes?: number[] }).etapes ?? []), 2] }),
};

const entree = (schemaVersion: number, mutation: object = { kind: 'exit' }) => ({
  client_ref: 'c1',
  schemaVersion,
  mutation,
});

describe('migrer (Arch §4.2)', () => {
  it('version courante : mutation inchangée', () => {
    expect(VERSION_MUTATIONS).toBe(1);
    expect(MIGRATIONS).toEqual({});
    expect(migrer(entree(1))).toEqual({ kind: 'exit' });
  });

  it('applique la chaîne depuis la version de l’entrée jusqu’à la courante, dans l’ordre', () => {
    expect(migrer(entree(1), CHAINE, 3)).toEqual({ kind: 'exit', etapes: [1, 2] });
    expect(migrer(entree(2), CHAINE, 3)).toEqual({ kind: 'exit', etapes: [2] });
    expect(migrer(entree(3), CHAINE, 3)).toEqual({ kind: 'exit' });
  });

  it('ne modifie pas l’entrée en file', () => {
    const e = entree(1);

    migrer(e, CHAINE, 3);

    expect(e.mutation).toEqual({ kind: 'exit' });
  });

  it.each([
    ['plus récente que le code (écrite par un onglet à jour)', 4],
    ['version non entière', 1.5],
    ['version nulle', 0],
  ])('version %s : non envoyable (null)', (_cas, version) => {
    expect(migrer(entree(version), CHAINE, 3)).toBeNull();
  });

  it('maillon manquant dans la chaîne : non envoyable (null)', () => {
    expect(migrer(entree(1), { 2: CHAINE[2] }, 3)).toBeNull();
  });
});
