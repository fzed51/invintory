import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseHorsLigne } from '../../hors-ligne/base.ts';
import { migrer, type Mutation } from '../../hors-ligne/mutations.ts';
import { ouvrir } from '../../test/application.tsx';
import { BOUTEILLES, CAVE } from '../../test/cave.ts';
import { jwt, reseauCoupe, simulerServeur } from '../../test/serveur.ts';
import { MESSAGES_FICHE } from '../bouteille/regles.ts';
import { MESSAGES_AJOUT } from './regles.ts';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// jsdom ne décode pas les images : la compression est simulée (testée à part, app/ajout/photo.test.ts).
const PHOTO_REDUITE = new Blob(['jpeg-reduit'], { type: 'image/jpeg' });
vi.mock('../../ajout/photo.ts', async (original) => ({
  ...(await original<typeof import('../../ajout/photo.ts')>()),
  compresserPhoto: vi.fn(async () => PHOTO_REDUITE),
}));

let enLigne = true;
let compte: string;

beforeEach(() => {
  localStorage.clear();
  enLigne = true;
  compte = crypto.randomUUID();
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => enLigne);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:apercu'), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const CODES = ['d2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];

/** Base du compte avec une réserve de codes et, au besoin, les copies de la cave (hors ligne). */
async function preparerBase({ codes = CODES, copies = false } = {}) {
  const base = new BaseHorsLigne(compte);
  await base.reserve.bulkAdd(codes.map((reference) => ({ reference })));
  if (copies) {
    const recueLe = '2026-10-09T18:00:00.000Z';
    await base.lectures.bulkPut([
      { route: '/api/cellar', corps: CAVE, recueLe },
      { route: '/api/bottles', corps: { bottles: BOUTEILLES }, recueLe },
    ]);
  }
  return base;
}

type Recue = Mutation & { client_ref: string; schema_version: number };

/** Serveur en ligne : lectures de la cave, référentiels, `/sync` et photos consignés. */
function serveurEnLigne() {
  const recues: Recue[] = [];
  const photos: Request[] = [];
  const routes: Parameters<typeof simulerServeur>[0] = {
    'POST /api/auth/refresh': Response.json({ access_token: jwt(compte), expires_in: 900 }),
    'GET /api/cellar': () => Response.json(CAVE),
    'GET /api/bottles': () => Response.json({ bottles: BOUTEILLES }),
    'GET /api/regions': Response.json({ regions: [{ id: 5, name: 'Bordeaux' }, { id: 6, name: 'Loire' }] }),
    'GET /api/grapes': Response.json({ grapes: [{ id: 9, name: 'Merlot' }] }),
    'POST /api/references/reservations': Response.json({ references: [] }, { status: 201 }),
    'POST /api/sync': async (requete) => {
      const { mutations } = (await requete.json()) as { mutations: Recue[] };
      recues.push(...mutations);
      for (const m of mutations) {
        routes[`PUT /api/photos/${m.client_ref}`] = (photo) => {
          photos.push(photo);
          return new Response(null, { status: 204 });
        };
      }
      return Response.json({
        results: mutations.map((m) => ({
          client_ref: m.client_ref,
          status: 'applied',
          bottles: m.kind === 'add' ? m.bottles.map((b, i) => ({ ...b, id: 100 + i, reference: b.reference ?? `g${i}` })) : undefined,
        })),
      });
    },
  };
  const serveur = simulerServeur(routes);
  return { ...serveur, recues, photos };
}

function serveurInjoignable() {
  enLigne = false;
  return simulerServeur({
    'POST /api/auth/refresh': Response.json({ access_token: jwt(compte), expires_in: 900 }),
    'GET /api/cellar': reseauCoupe,
    'GET /api/bottles': reseauCoupe,
    'GET /api/regions': reseauCoupe,
    'GET /api/grapes': reseauCoupe,
    'POST /api/references/reservations': reseauCoupe,
    'POST /api/sync': reseauCoupe,
  });
}

/** Ajout de la file locale, sous sa forme courante. */
async function ajoutsEnFile(base: BaseHorsLigne) {
  return (await base.file.toArray()).map((entree) => ({ client_ref: entree.client_ref, mutation: migrer(entree) }));
}

/** Formulaire prêt : la cave est lue (emplacement proposé affiché). */
async function formulairePret() {
  return await screen.findByRole('region', { name: 'Emplacement' }).then(async (region) => {
    await waitFor(() => expect(within(region).queryByText('Chargement de la cave')).toBeNull());
    return region;
  });
}

const champ = (nom: string) => screen.getByLabelText(nom) as HTMLInputElement;

describe('Ajout de bouteilles : formulaire (CdC §3.3)', () => {
  it('« + » de la barre : formulaire vide, une bouteille, entrée le mois courant, emplacement proposé', async () => {
    await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/');

    await utilisateur.click(await screen.findByRole('link', { name: 'Ajouter une bouteille' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Ajouter des bouteilles' })).toBeTruthy();
    const maintenant = new Date();
    expect(champ('Date d’entrée').value).toBe(`${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`);
    expect(champ('Nombre de bouteilles').value).toBe('1');
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('rouge');
    expect(screen.getByRole('radio', { name: 'Achetée' }).getAttribute('aria-checked')).toBe('true');
    const emplacement = await formulairePret();
    expect(within(emplacement).getByText('Emplacement proposé')).toBeTruthy();
    expect(within(emplacement).getByText('Cave du bas · Étagère 1')).toBeTruthy();
    expect(within(emplacement).getByText('10 places libres')).toBeTruthy();
  });

  it('autocomplétion : régions et cépages connus', async () => {
    await preparerBase();
    serveurEnLigne();
    ouvrir('/add');
    await formulairePret();

    await waitFor(() => {
      const regions = document.getElementById(champ('Région').getAttribute('list') ?? '');
      expect([...(regions?.querySelectorAll('option') ?? [])].map((o) => o.value)).toEqual(['Bordeaux', 'Loire']);
    });
    const cepages = document.getElementById(champ('Cépage').getAttribute('list') ?? '');
    expect([...(cepages?.querySelectorAll('option') ?? [])].map((o) => o.value)).toEqual(['Merlot']);
  });

  it('ajout unitaire en ligne : mutation `add` envoyée par /sync, avec le code réservé ; références affichées', async () => {
    const base = await preparerBase();
    const serveur = serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    await formulairePret();

    await utilisateur.selectOptions(screen.getByLabelText('Type'), 'blanc');
    await utilisateur.type(champ('Domaine'), 'Château Exemple');
    await utilisateur.type(champ('Région'), 'Bordeaux');
    await utilisateur.type(champ('Millésime'), '2018');
    await utilisateur.click(screen.getByRole('radio', { name: 'Offerte' }));
    await utilisateur.click(screen.getByLabelText('Souvenir'));
    await utilisateur.type(champ('Note'), 'Offert par Paul');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    const confirmation = await screen.findByRole('status', { name: /Bouteille ajoutée/ });
    expect(within(confirmation).getByText('d2')).toBeTruthy();
    expect(confirmation.textContent).toContain('Cave du bas · Étagère 1');
    await waitFor(() => expect(serveur.recues).toHaveLength(1));
    const [ajout] = serveur.recues;
    expect(ajout).toMatchObject({
      schema_version: 1,
      kind: 'add',
      bottles: [{ reference: 'd2' }],
      fields: {
        type: 'blanc',
        region: 'Bordeaux',
        grape: null,
        domain: 'Château Exemple',
        vintage: 2018,
        origin: 'offerte',
        note: 'Offert par Paul',
        souvenir: true,
      },
      location: { type: 'etagere', id: 12 },
    });
    await waitFor(async () => expect(await base.file.count()).toBe(0));
  });

  it('ajout en masse : N bouteilles d’un seul formulaire, chacune avec son client_ref et sa référence', async () => {
    const base = await preparerBase();
    const serveur = serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    await formulairePret();

    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '6');
    await utilisateur.type(champ('Domaine'), 'Domaine Delaunay');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    const confirmation = await screen.findByRole('status', { name: /6 bouteilles ajoutées/ });
    expect(within(confirmation).getAllByText(/^d[2-7]$/).map((e) => e.textContent)).toEqual(['d2', 'd3', 'd4', 'd5', 'd6', 'd7']);
    await waitFor(() => expect(serveur.recues).toHaveLength(1));
    const bouteilles = serveur.recues[0].kind === 'add' ? serveur.recues[0].bottles : [];
    expect(new Set(bouteilles.map((b) => b.client_ref)).size).toBe(6);
    expect((await base.reserve.toArray()).map((r) => r.reference)).toEqual(['d8', 'd9']);
  });

  it('ajout en masse : l’emplacement proposé a la place pour toutes les bouteilles', async () => {
    await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    const emplacement = await formulairePret();

    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '5');
    expect(within(emplacement).getByText('Cave du bas · Étagère 1')).toBeTruthy();
    await utilisateur.click(within(emplacement).getByRole('button', { name: 'Autre emplacement' }));
    expect(within(emplacement).getByText('Carton Bordeaux')).toBeTruthy();
    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '11');
    expect(within(emplacement).getByText(MESSAGES_AJOUT.aucunePlace)).toBeTruthy();
  });

  it('« Autre emplacement » : la place suivante, puis retour à la première', async () => {
    await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    const emplacement = await formulairePret();
    const autre = within(emplacement).getByRole('button', { name: 'Autre emplacement' });

    await utilisateur.click(autre);
    expect(within(emplacement).getByText('Cave du bas · Magnums')).toBeTruthy();
    await utilisateur.click(autre);
    await utilisateur.click(autre);
    expect(within(emplacement).getByText('Cave du bas · Étagère 1')).toBeTruthy();
  });

  it('depuis un carton : emplacement pré-rempli', async () => {
    const base = await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add?box=4');
    const emplacement = await formulairePret();

    expect(within(emplacement).getByText('Emplacement choisi')).toBeTruthy();
    expect(within(emplacement).getByText('Carton Bordeaux')).toBeTruthy();
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    await screen.findByRole('status', { name: /Bouteille ajoutée/ });
    await waitFor(async () => expect(await base.correspondances.count()).toBe(1));
  });

  it('depuis une étagère : emplacement pré-rempli', async () => {
    await preparerBase();
    serveurEnLigne();
    ouvrir('/add?shelf=13');
    const emplacement = await formulairePret();

    expect(within(emplacement).getByText('Emplacement choisi')).toBeTruthy();
    expect(within(emplacement).getByText('Cave du bas · Magnums')).toBeTruthy();
  });

  it('emplacement pré-rempli inconnu : retour à la proposition', async () => {
    await preparerBase();
    serveurEnLigne();
    ouvrir('/add?shelf=99');
    const emplacement = await formulairePret();

    expect(within(emplacement).getByText('Emplacement proposé')).toBeTruthy();
  });

  it('Hors rangement : choisi en un geste', async () => {
    await preparerBase();
    const serveur = serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    const emplacement = await formulairePret();

    await utilisateur.click(within(emplacement).getByRole('button', { name: 'Hors rangement' }));
    expect(within(emplacement).getByText('Emplacement choisi')).toBeTruthy();
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(serveur.recues).toHaveLength(1));
    expect(serveur.recues[0]).toMatchObject({ location: { type: 'hors_rangement' } });
  });
});

describe('Ajout : capacité bloquante (CdC §3.2, §3.3)', () => {
  it('emplacement pré-rempli trop petit pour le lot : refusé, rien n’est mis en file', async () => {
    const base = await preparerBase();
    const serveur = serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add?box=4');
    await formulairePret();

    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '6');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain(
      'Place insuffisante : 5 places libres sur 6. Choisissez un autre emplacement ou ajoutez moins de bouteilles.',
    );
    expect(await base.file.count()).toBe(0);
    expect(serveur.appels('POST /api/sync')).toHaveLength(0);
  });

  it('choix manuel : étagères et cartons trop petits pour le lot désactivés', async () => {
    await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    const emplacement = await formulairePret();

    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '6');
    await utilisateur.click(within(emplacement).getByRole('button', { name: 'Choisir manuellement' }));

    const magnums = within(emplacement).getByRole('button', { name: /^Magnums/ }) as HTMLButtonElement;
    expect(magnums.disabled).toBe(true);
    expect(magnums.getAttribute('aria-label')).toContain('place insuffisante');
    const carton = within(emplacement).getByRole('button', { name: /^Carton Bordeaux/ }) as HTMLButtonElement;
    expect(carton.disabled).toBe(true);
    expect(carton.getAttribute('aria-label')).toBe('Carton Bordeaux, 1 bouteille sur 6, place insuffisante');
    const etagere1 = within(emplacement).getByRole('button', { name: /^Étagère 1/ }) as HTMLButtonElement;
    await utilisateur.click(etagere1);
    expect(etagere1.getAttribute('aria-pressed')).toBe('true');
  });

  it('aucune place proposée et rien de choisi : refusé', async () => {
    const base = await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    await formulairePret();

    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '20');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect((await screen.findByRole('alert')).textContent).toContain(MESSAGES_AJOUT.emplacementManquant);
    expect(await base.file.count()).toBe(0);
  });
});

describe('Ajout : saisie vérifiée avant la mise en file', () => {
  it.each([['0'], ['101'], ['2,5'], ['']])('nombre de bouteilles « %s » : refusé', async (saisie) => {
    const base = await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add?box=4');
    await formulairePret();

    await utilisateur.clear(champ('Nombre de bouteilles'));
    if (saisie !== '') await utilisateur.type(champ('Nombre de bouteilles'), saisie);
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(await screen.findByText(MESSAGES_AJOUT.quantiteInvalide)).toBeTruthy();
    expect(champ('Nombre de bouteilles').getAttribute('aria-invalid')).toBe('true');
    expect(await base.file.count()).toBe(0);
  });

  it('millésime invalide et date d’entrée vidée : refusés', async () => {
    const base = await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    await formulairePret();

    await utilisateur.type(champ('Millésime'), '18');
    await utilisateur.clear(champ('Date d’entrée'));
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(await screen.findByText(MESSAGES_FICHE.millesimeInvalide)).toBeTruthy();
    expect(screen.getByText(MESSAGES_FICHE.dateEntreeInvalide)).toBeTruthy();
    expect(await base.file.count()).toBe(0);
  });
});

describe('Ajout hors ligne (CdC §4)', () => {
  it('mis en file sans réseau ; références de la réserve affichées ; bouteilles visibles dans la cave', async () => {
    const base = await preparerBase({ copies: true });
    const serveur = serveurInjoignable();
    const utilisateur = userEvent.setup();
    ouvrir('/add?box=4');
    await formulairePret();

    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '2');
    await utilisateur.type(champ('Domaine'), 'Domaine Neuf');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    const confirmation = await screen.findByRole('status', { name: /2 bouteilles ajoutées/ });
    expect(within(confirmation).getByText('d2')).toBeTruthy();
    expect(within(confirmation).getByText('d3')).toBeTruthy();
    expect(await base.file.count()).toBe(1);
    expect(serveur.appels('PUT /api/photos')).toHaveLength(0);

    await utilisateur.click(within(confirmation).getByRole('link', { name: 'Voir la cave' }));
    const carton = await screen.findByRole('region', { name: 'Carton Bordeaux' });
    expect(carton.textContent).toContain('3 / 6 bouteilles');
    expect(within(carton).getAllByText('En attente de synchronisation')).toHaveLength(2);
  });

  it('réserve épuisée : la référence sera attribuée à la synchronisation', async () => {
    await preparerBase({ codes: ['d2'], copies: true });
    serveurInjoignable();
    const utilisateur = userEvent.setup();
    ouvrir('/add?box=4');
    await formulairePret();

    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '2');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    const confirmation = await screen.findByRole('status', { name: /2 bouteilles ajoutées/ });
    expect(within(confirmation).getByText('d2')).toBeTruthy();
    expect(confirmation.textContent).toContain(MESSAGES_AJOUT.referenceDifferee);
  });

  it('cave jamais lue (hors ligne, sans copie) : seul Hors rangement est possible', async () => {
    const base = await preparerBase();
    serveurInjoignable();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    const emplacement = await formulairePret();

    expect(within(emplacement).getByText(MESSAGES_AJOUT.caveIndisponible)).toBeTruthy();
    await utilisateur.click(within(emplacement).getByRole('button', { name: 'Hors rangement' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    await screen.findByRole('status', { name: /Bouteille ajoutée/ });
    expect((await ajoutsEnFile(base))[0].mutation).toMatchObject({ location: { type: 'hors_rangement' } });
  });
});

describe('Ajout : photo (Arch §5)', () => {
  it('photo réduite, aperçue, puis envoyée sous le client_ref du lot après l’ajout (contrat §11)', async () => {
    const base = await preparerBase();
    const serveur = serveurEnLigne();
    const { compresserPhoto } = await import('../../ajout/photo.ts');
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    await formulairePret();

    const original = new File(['brut'], 'IMG_0001.jpg', { type: 'image/jpeg' });
    await utilisateur.upload(champ('Photo'), original);

    expect(compresserPhoto).toHaveBeenCalledWith(original);
    expect((await screen.findByRole('img', { name: 'Aperçu de la photo' })).getAttribute('src')).toBe('blob:apercu');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(serveur.photos).toHaveLength(1));
    expect(serveur.photos[0].url).toContain(`/api/photos/${serveur.recues[0].client_ref}`);
    expect(serveur.photos[0].headers.get('Content-Type')).toBe('image/jpeg');
    await waitFor(async () => expect(await base.photos.count()).toBe(0));
  });

  it('photo du lot mise en file avec l’ajout (hors ligne)', async () => {
    const base = await preparerBase({ copies: true });
    serveurInjoignable();
    const utilisateur = userEvent.setup();
    ouvrir('/add?box=4');
    await formulairePret();

    await utilisateur.upload(champ('Photo'), new File(['brut'], 'IMG_0001.jpg', { type: 'image/jpeg' }));
    await screen.findByRole('img', { name: 'Aperçu de la photo' });
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    await screen.findByRole('status', { name: /Bouteille ajoutée/ });
    const [ajout] = await ajoutsEnFile(base);
    const photos = await base.photos.toArray();
    expect(photos.map((p) => p.client_ref)).toEqual([ajout.client_ref]);
    expect(await photos[0].blob.text()).toBe('jpeg-reduit');
  });

  it('retirer la photo avant l’ajout', async () => {
    const base = await preparerBase({ copies: true });
    serveurInjoignable();
    const utilisateur = userEvent.setup();
    ouvrir('/add?box=4');
    await formulairePret();

    await utilisateur.upload(champ('Photo'), new File(['brut'], 'IMG_0001.jpg', { type: 'image/jpeg' }));
    await utilisateur.click(await screen.findByRole('button', { name: 'Retirer la photo' }));
    expect(screen.queryByRole('img', { name: 'Aperçu de la photo' })).toBeNull();
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));

    await screen.findByRole('status', { name: /Bouteille ajoutée/ });
    expect(await base.photos.count()).toBe(0);
  });

  it('image illisible : le dit sous le champ, pas de photo', async () => {
    const { compresserPhoto, ErreurPhoto } = await import('../../ajout/photo.ts');
    vi.mocked(compresserPhoto).mockRejectedValueOnce(new ErreurPhoto());
    await preparerBase();
    serveurEnLigne();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    await formulairePret();

    await utilisateur.upload(champ('Photo'), new File(['brut'], 'IMG.heic', { type: 'image/heic' }));

    expect(await screen.findByText('Photo illisible. Choisir une autre image.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Aperçu de la photo' })).toBeNull();
  });
});

describe('Ajout : brouillon enregistré en continu (P4, issue #21)', () => {
  it('saisie reprise à la réouverture du formulaire (rechargement, mise à jour de la PWA)', async () => {
    await preparerBase({ copies: true });
    serveurInjoignable();
    const utilisateur = userEvent.setup();
    const premier = ouvrir('/add');
    await formulairePret();

    await utilisateur.type(champ('Domaine'), 'Château Brouillon');
    await utilisateur.clear(champ('Nombre de bouteilles'));
    await utilisateur.type(champ('Nombre de bouteilles'), '3');
    await utilisateur.upload(champ('Photo'), new File(['brut'], 'IMG_0001.jpg', { type: 'image/jpeg' }));
    await screen.findByRole('img', { name: 'Aperçu de la photo' });
    await new Promise((fin) => setTimeout(fin, 50));
    premier.unmount();

    ouvrir('/add');
    await formulairePret();

    expect(await screen.findByRole('status', { name: /Saisie reprise/ })).toBeTruthy();
    expect(champ('Domaine').value).toBe('Château Brouillon');
    expect(champ('Nombre de bouteilles').value).toBe('3');
    expect(screen.getByRole('img', { name: 'Aperçu de la photo' })).toBeTruthy();
  });

  it('Abandonner : saisie effacée, formulaire vide, brouillon supprimé', async () => {
    const base = await preparerBase({ copies: true });
    serveurInjoignable();
    const utilisateur = userEvent.setup();
    ouvrir('/add');
    await formulairePret();

    await utilisateur.type(champ('Domaine'), 'À oublier');
    await waitFor(async () => expect(await base.brouillons.count()).toBe(1));
    await utilisateur.click(screen.getByRole('button', { name: 'Abandonner' }));

    expect(champ('Domaine').value).toBe('');
    await waitFor(async () => expect(await base.brouillons.count()).toBe(0));
  });

  it('brouillon effacé après l’ajout ; « Ajouter d’autres bouteilles » rouvre un formulaire vide', async () => {
    const base = await preparerBase({ copies: true });
    serveurInjoignable();
    const utilisateur = userEvent.setup();
    ouvrir('/add?box=4');
    await formulairePret();

    await utilisateur.type(champ('Domaine'), 'Domaine Ajouté');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }));
    const confirmation = await screen.findByRole('status', { name: /Bouteille ajoutée/ });

    expect(await base.brouillons.count()).toBe(0);
    await utilisateur.click(within(confirmation).getByRole('button', { name: 'Ajouter d’autres bouteilles' }));
    expect(champ('Domaine').value).toBe('');
  });
});
