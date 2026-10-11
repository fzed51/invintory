import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bouteille, Cave } from '../../cave/types.ts';
import { BaseHorsLigne } from '../../hors-ligne/base.ts';
import { ouvrir } from '../../test/application.tsx';
import { BOUTEILLES, CAVE, FICHE } from '../../test/cave.ts';
import { jwt, reseauCoupe, simulerServeur } from '../../test/serveur.ts';
import { MESSAGES_MOUVEMENT } from './regles.ts';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

let enLigne = true;

beforeEach(() => {
  localStorage.clear();
  enLigne = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => enLigne);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LIBELLES: Record<string, Bouteille['location']> = {
  'etagere:12': { type: 'etagere', id: 12, cabinet_id: 3, label: 'Cave du bas · Étagère 1' },
  'etagere:13': { type: 'etagere', id: 13, cabinet_id: 3, label: 'Cave du bas · Magnums' },
  'carton:4': { type: 'carton', id: 4, label: 'Carton Bordeaux' },
  hors_rangement: { type: 'hors_rangement' },
};

type MutationRecue = {
  client_ref: string;
  schema_version: number;
  kind: string;
  occurred_at: string;
  bottle: string;
  location?: { type: string; id?: number };
  exit_reason?: string;
};

/**
 * Serveur de la cave de test, avec état : `/api/sync` applique déplacements et sorties,
 * les lectures suivantes les reflètent. `compte` : sub du jeton (base locale ouverte).
 */
function serveurCave(compte: string, { initiales = BOUTEILLES, cave = CAVE }: { initiales?: Bouteille[]; cave?: Cave } = {}) {
  let bouteilles = structuredClone(initiales);
  const occupees = (cle: string) =>
    bouteilles.filter(
      (b) => b.status === 'en_cave' && (b.location.type === 'hors_rangement' ? 'hors_rangement' : `${b.location.type}:${b.location.id}`) === cle,
    ).length;
  const cellar = (): Cave => ({
    cabinets: cave.cabinets.map((a) => ({ ...a, shelves: a.shelves.map((e) => ({ ...e, occupied: occupees(`etagere:${e.id}`) })) })),
    boxes: cave.boxes.map((c) => ({ ...c, occupied: occupees(`carton:${c.id}`) })),
    unplaced: occupees('hors_rangement'),
  });
  const fiche = (id: number) => {
    const bouteille = bouteilles.find((b) => b.id === id);
    return bouteille === undefined
      ? Response.json({ error: { code: 'NOT_FOUND', message: 'Bouteille introuvable.' } }, { status: 404 })
      : Response.json({ ...bouteille, movements: id === 41 ? FICHE.movements : [] });
  };
  const recues: MutationRecue[] = [];
  const serveur = simulerServeur({
    'POST /api/auth/refresh': Response.json({ access_token: jwt(compte), expires_in: 900 }),
    'GET /api/cellar': () => Response.json(cellar()),
    'GET /api/bottles': () => Response.json({ bottles: bouteilles.filter((b) => b.status === 'en_cave') }),
    'GET /api/bottles/41': () => fiche(41),
    'GET /api/bottles/44': () => fiche(44),
    'POST /api/sync': async (requete) => {
      const { mutations } = (await requete.json()) as { mutations: MutationRecue[] };
      recues.push(...mutations);
      for (const m of mutations) {
        bouteilles = bouteilles.map((b) => {
          if (b.client_ref !== m.bottle) return b;
          if (m.kind === 'exit') return { ...b, status: 'sortie', location: { type: 'hors_rangement' } };
          const cle = m.location?.type === 'hors_rangement' ? 'hors_rangement' : `${m.location?.type}:${m.location?.id}`;
          return { ...b, location: LIBELLES[cle] };
        });
      }
      return Response.json({
        results: mutations.map((m, i) => ({ client_ref: m.client_ref, status: 'applied', movement_id: 100 + i, redirected: null })),
      });
    },
  });
  return { ...serveur, recues };
}

/** Base locale du compte avec les copies de la cave et des bouteilles (hors ligne). */
async function copiesLocales(compte: string) {
  const base = new BaseHorsLigne(compte);
  const recueLe = '2026-10-09T18:00:00.000Z';
  await base.lectures.bulkPut([
    { route: '/api/cellar', corps: CAVE, recueLe },
    { route: '/api/bottles', corps: { bottles: BOUTEILLES }, recueLe },
    { route: '/api/bottles/41', corps: FICHE, recueLe },
  ]);
  return base;
}

function serveurInjoignable(compte: string) {
  enLigne = false;
  return simulerServeur({
    'POST /api/auth/refresh': Response.json({ access_token: jwt(compte), expires_in: 900 }),
    'GET /api/cellar': reseauCoupe,
    'GET /api/bottles': reseauCoupe,
    'GET /api/bottles/41': reseauCoupe,
    'GET /api/bottles/41/photo': reseauCoupe,
    'POST /api/sync': reseauCoupe,
  });
}

function attribut(terme: string): string | null {
  const dt = [...document.querySelectorAll('dt')].find((e) => e.textContent === terme);
  return dt?.nextElementSibling?.textContent ?? null;
}

const feuille = (nom: string) => screen.getByRole('dialog', { name: nom });

/** Bouton Déplacer, une fois la cave lue (désactivé avant). */
async function deplacerDisponible() {
  return await waitFor(() => {
    const bouton = screen.getByRole('button', { name: 'Déplacer' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);
    return bouton;
  });
}

/** Ouvre la fiche 41 (Étagère 1) et la feuille Déplacer. */
async function ouvrirDeplacer() {
  const utilisateur = userEvent.setup();
  ouvrir('/bottles/41');
  await utilisateur.click(await deplacerDisponible());
  return { utilisateur, dialogue: feuille('Déplacer la bouteille') };
}

describe('Déplacer (CdC §3.2, §3.5)', () => {
  it('propose la première place libre hors de l’emplacement actuel ; « Autre emplacement » passe à la suivante', async () => {
    const serveur = serveurCave(crypto.randomUUID());
    const { utilisateur, dialogue } = await ouvrirDeplacer();

    expect(within(dialogue).getByText('Cave du bas · Magnums')).toBeTruthy();
    expect(within(dialogue).getByText('4 places libres')).toBeTruthy();
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Autre emplacement' }));
    expect(within(dialogue).getByText('Carton Bordeaux')).toBeTruthy();
    expect(within(dialogue).getByText('5 places libres')).toBeTruthy();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Déplacer' }));

    await waitFor(() => expect(attribut('Emplacement')).toBe('Carton Bordeaux'));
    expect(serveur.recues).toEqual([
      {
        client_ref: expect.stringMatching(/^[0-9a-f-]{36}$/),
        schema_version: 1,
        kind: 'move',
        occurred_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        bottle: 'ref-41',
        location: { type: 'carton', id: 4 },
      },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Hors rangement en un geste', async () => {
    const serveur = serveurCave(crypto.randomUUID());
    const { utilisateur, dialogue } = await ouvrirDeplacer();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Hors rangement' }));

    await waitFor(() => expect(attribut('Emplacement')).toBe('Hors rangement'));
    expect(serveur.recues[0]).toMatchObject({ kind: 'move', bottle: 'ref-41', location: { type: 'hors_rangement' } });
  });

  it('choisir manuellement : étagère, carton ou Hors rangement ; l’emplacement actuel n’est pas proposé', async () => {
    const serveur = serveurCave(crypto.randomUUID());
    const { utilisateur, dialogue } = await ouvrirDeplacer();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Choisir manuellement' }));

    expect(within(dialogue).queryByRole('button', { name: /^Étagère 1,/ })).toBeNull();
    expect(within(dialogue).getByRole('button', { name: 'Magnums, 0 alvéole occupée sur 4, emplacement proposé' })).toBeTruthy();
    expect(within(dialogue).getByRole('button', { name: 'Carton Bordeaux, 1 bouteille sur 6' })).toBeTruthy();
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Annuler' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Déplacer' }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Autre emplacement' }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Choisir manuellement' }));
    expect(within(dialogue).getByRole('button', { name: 'Carton Bordeaux, 1 bouteille sur 6, proposé' })).toBeTruthy();
    await utilisateur.click(within(dialogue).getByRole('button', { name: /^Magnums,/ }));
    expect(within(dialogue).getByRole('button', { name: 'Hors rangement' })).toBeTruthy();
    expect(within(dialogue).getByRole('button', { name: /^Magnums,/ }).getAttribute('aria-pressed')).toBe('true');
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Déplacer' }));

    await waitFor(() => expect(attribut('Emplacement')).toBe('Cave du bas · Magnums'));
    expect(serveur.recues[0]).toMatchObject({ location: { type: 'etagere', id: 13 } });
  });

  it('choisir manuellement sans choix : « Déplacer » demande un emplacement', async () => {
    const serveur = serveurCave(crypto.randomUUID());
    const { utilisateur, dialogue } = await ouvrirDeplacer();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Choisir manuellement' }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Déplacer' }));

    expect(within(dialogue).getByText(MESSAGES_MOUVEMENT.emplacementManquant)).toBeTruthy();
    expect(serveur.recues).toEqual([]);
  });

  it('emplacement complet : désactivé, « complète » ; jamais proposé', async () => {
    const pleine = BOUTEILLES.map((b) => (b.id === 44 ? { ...b, location: LIBELLES['etagere:13'] } : b));
    const cave = { ...CAVE, cabinets: [{ ...CAVE.cabinets[0], shelves: [CAVE.cabinets[0].shelves[0], { ...CAVE.cabinets[0].shelves[1], capacity: 1 }] }] };
    serveurCave(crypto.randomUUID(), { initiales: pleine, cave });
    const { utilisateur, dialogue } = await ouvrirDeplacer();

    expect(within(dialogue).getByText('Carton Bordeaux')).toBeTruthy();
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Choisir manuellement' }));

    const magnums = within(dialogue).getByRole('button', { name: 'Magnums, 1 alvéole occupée sur 1, complète' });
    expect((magnums as HTMLButtonElement).disabled).toBe(true);
  });

  it('Annuler : rien n’est envoyé', async () => {
    const serveur = serveurCave(crypto.randomUUID());
    const { utilisateur, dialogue } = await ouvrirDeplacer();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(serveur.recues).toEqual([]);
  });

  it('hors ligne : mis en file, visible aussitôt sur la fiche et dans la cave', async () => {
    const compte = crypto.randomUUID();
    (await copiesLocales(compte)).close();
    serveurInjoignable(compte);
    const { utilisateur, dialogue } = await ouvrirDeplacer();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Hors rangement' }));

    await waitFor(() => expect(attribut('Emplacement')).toBe('Hors rangement'));
    const historique = within(screen.getByRole('region', { name: 'Historique' })).getAllByRole('listitem');
    expect(historique).toHaveLength(3);
    expect(historique[2].textContent).toContain('de Cave du bas · Étagère 1 vers Hors rangement');
    expect(historique[2].textContent).toContain('En attente de synchronisation');
    expect(screen.getByText(/1 mouvement en attente de synchronisation/)).toBeTruthy();

    await utilisateur.click(screen.getByRole('link', { name: 'Cave' }));
    const hors = await screen.findByRole('region', { name: 'Hors rangement' });
    expect(within(hors).getByText('2 bouteilles')).toBeTruthy();
    expect(within(hors).getByRole('link', { name: /Domaine a7/ })).toBeTruthy();
    const etagere = screen.getByRole('region', { name: 'Étagère 1' });
    expect(within(etagere).getByText('1 / 12 alvéoles')).toBeTruthy();
  });
});

describe('Sortir (CdC §3.4)', () => {
  it('motif obligatoire, confirmé en feuille basse ; la bouteille passe au statut Sortie', async () => {
    const utilisateur = userEvent.setup();
    const serveur = serveurCave(crypto.randomUUID());
    ouvrir('/bottles/41');

    const sortir = await screen.findByRole('button', { name: 'Sortir' });
    expect(sortir.className).toContain('ivt-btn--danger');
    await utilisateur.click(sortir);
    const dialogue = feuille('Sortir la bouteille');
    expect(within(dialogue).getByText('La sortie est définitive : la bouteille quitte la cave.')).toBeTruthy();
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Sortir' }));
    expect(within(dialogue).getByText(MESSAGES_MOUVEMENT.motifManquant)).toBeTruthy();
    expect(serveur.recues).toEqual([]);

    const motifs = within(dialogue).getByRole('radiogroup', { name: 'Motif' });
    expect(within(motifs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Consommée', 'Offerte', 'Perdue-cassée']);
    await utilisateur.click(within(motifs).getByRole('radio', { name: 'Offerte' }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Sortir' }));

    await waitFor(() => expect(attribut('Statut')).toBe('Sortie'));
    expect(serveur.recues[0]).toMatchObject({ kind: 'exit', bottle: 'ref-41', exit_reason: 'offerte' });
    expect(attribut('Emplacement')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Déplacer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sortir' })).toBeNull();
  });

  it('hors ligne : sortie en attente dans l’historique, bouteille retirée de la cave', async () => {
    const utilisateur = userEvent.setup();
    const compte = crypto.randomUUID();
    (await copiesLocales(compte)).close();
    serveurInjoignable(compte);
    ouvrir('/bottles/41');

    await utilisateur.click(await screen.findByRole('button', { name: 'Sortir' }));
    const dialogue = feuille('Sortir la bouteille');
    await utilisateur.click(within(dialogue).getByRole('radio', { name: 'Consommée' }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Sortir' }));

    await waitFor(() => expect(attribut('Statut')).toBe('Sortie'));
    const historique = within(screen.getByRole('region', { name: 'Historique' })).getAllByRole('listitem');
    expect(historique[2].textContent).toContain('Sortie — Consommée');
    expect(historique[2].textContent).toContain('En attente de synchronisation');

    await utilisateur.click(screen.getByRole('link', { name: 'Cave' }));
    const etagere = await screen.findByRole('region', { name: 'Étagère 1' });
    expect(within(etagere).getByText('1 / 12 alvéoles')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Domaine a7/ })).toBeNull();
  });
});

describe('Vue Hors rangement (CdC §3.5)', () => {
  it('liste les bouteilles hors rangement, avec Déplacer et Sortir ; lien depuis la cave', async () => {
    const utilisateur = userEvent.setup();
    serveurCave(crypto.randomUUID());
    ouvrir('/');

    const section = await screen.findByRole('region', { name: 'Hors rangement' });
    await utilisateur.click(within(section).getByRole('link', { name: 'Hors rangement' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Hors rangement' })).toBeTruthy();
    const lignes = await screen.findAllByRole('listitem');
    expect(lignes).toHaveLength(1);
    expect(within(lignes[0]).getByRole('link', { name: /Domaine c9/ })).toBeTruthy();
    expect(within(lignes[0]).getByRole('button', { name: 'Déplacer' })).toBeTruthy();
    expect(within(lignes[0]).getByRole('button', { name: 'Sortir' })).toBeTruthy();
  });

  it('Déplacer vers la place proposée : la bouteille quitte la vue', async () => {
    const utilisateur = userEvent.setup();
    const serveur = serveurCave(crypto.randomUUID());
    ouvrir('/unplaced');

    await utilisateur.click(await deplacerDisponible());
    const dialogue = feuille('Déplacer la bouteille');
    expect(within(dialogue).getByText('Cave du bas · Étagère 1')).toBeTruthy();
    expect(within(dialogue).queryByRole('button', { name: 'Hors rangement' })).toBeNull();
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Déplacer' }));

    expect(await screen.findByText('Aucune bouteille hors rangement.')).toBeTruthy();
    expect(serveur.recues[0]).toMatchObject({ bottle: 'ref-44', location: { type: 'etagere', id: 12 } });
  });

  it('Sortir : la bouteille quitte la vue', async () => {
    const utilisateur = userEvent.setup();
    const serveur = serveurCave(crypto.randomUUID());
    ouvrir('/unplaced');

    await utilisateur.click(await screen.findByRole('button', { name: 'Sortir' }));
    const dialogue = feuille('Sortir la bouteille');
    await utilisateur.click(within(dialogue).getByRole('radio', { name: 'Perdue-cassée' }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Sortir' }));

    expect(await screen.findByText('Aucune bouteille hors rangement.')).toBeTruthy();
    expect(serveur.recues[0]).toMatchObject({ kind: 'exit', bottle: 'ref-44', exit_reason: 'perdue_cassee' });
  });
});
