import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseHorsLigne } from '../../hors-ligne/base.ts';
import { ouvrir } from '../../test/application.tsx';
import { BOUTEILLES, CAVE } from '../../test/cave.ts';
import { erreur, jeton, jwt, reseauCoupe, simulerServeur } from '../../test/serveur.ts';
import { MESSAGES_EMPLACEMENT } from './regles.ts';

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

const REFRESH = 'POST /api/auth/refresh';
const LECTURES = {
  [REFRESH]: jeton('j1'),
  'GET /api/cellar': Response.json(CAVE),
  'GET /api/bottles': Response.json({ bottles: BOUTEILLES }),
};

const section = (nom: string) => screen.getByRole('region', { name: nom });

/** Messages d'erreur de champ au texte exact (getByText normalise l'espace insécable de « 65 535 »). */
const erreursDeChamp = (message: string) =>
  [...document.querySelectorAll('.ivt-field__error')].filter((e) => e.textContent === message);

describe('Cave : vue globale hiérarchique (CdC §3.1)', () => {
  it('Armoire > Étagère > bouteilles, puis Cartons et Hors rangement', async () => {
    simulerServeur(LECTURES);

    ouvrir('/');

    const armoire = await screen.findByRole('region', { name: 'Cave du bas' });
    expect(within(armoire).getByRole('link', { name: 'Cave du bas' }).getAttribute('href')).toBe('/cabinets/3');
    const etagere1 = within(armoire).getByRole('region', { name: 'Étagère 1' });
    expect(etagere1.textContent).toContain('2 / 12 alvéoles');
    expect(within(etagere1).getAllByRole('link').map((lien) => lien.getAttribute('href'))).toEqual([
      '/bottles/41',
      '/bottles/42',
    ]);
    const magnums = within(armoire).getByRole('region', { name: 'Magnums' });
    expect(magnums.textContent).toContain('0 / 4 alvéoles');
    expect(magnums.textContent).toContain('Aucune bouteille.');

    const cartons = section('Cartons');
    const carton = within(cartons).getByRole('region', { name: 'Carton Bordeaux' });
    expect(carton.textContent).toContain('1 / 6 bouteilles');
    expect(within(carton).getByRole('link', { name: 'Carton Bordeaux' }).getAttribute('href')).toBe('/boxes/4');
    expect(carton.textContent).toContain('non millésimé');

    const horsRangement = section('Hors rangement');
    expect(horsRangement.textContent).toContain('1 bouteille');
    expect(within(horsRangement).getByText('c9')).toBeTruthy();
  });

  it('les bouteilles affichent leur référence et leurs badges', async () => {
    simulerServeur(LECTURES);

    ouvrir('/');

    const etagere1 = await screen.findByRole('region', { name: 'Étagère 1' });
    expect(within(etagere1).getByText('a7')).toBeTruthy();
    expect(within(etagere1).getByText('Blanc')).toBeTruthy();
    expect(within(section('Cartons')).getByText('Souvenir')).toBeTruthy();
    expect(within(section('Hors rangement')).getByText("À boire d'urgence")).toBeTruthy();
  });

  it('cave vide : le dit et propose de créer une armoire ou un carton', async () => {
    simulerServeur({
      ...LECTURES,
      'GET /api/cellar': Response.json({ cabinets: [], boxes: [], unplaced: 0 }),
      'GET /api/bottles': Response.json({ bottles: [] }),
    });

    ouvrir('/');

    expect(await screen.findByText(/Aucun emplacement\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ajouter une armoire' }).getAttribute('href')).toBe('/cabinets/new');
    expect(screen.getByRole('link', { name: 'Ajouter un carton' }).getAttribute('href')).toBe('/boxes/new');
    expect(screen.queryByRole('region', { name: 'Hors rangement' })).toBeNull();
  });

  it('serveur injoignable sans copie locale : le dit', async () => {
    simulerServeur({ ...LECTURES, 'GET /api/cellar': reseauCoupe, 'GET /api/bottles': reseauCoupe });

    ouvrir('/');

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Cave indisponible');
    expect(alerte.textContent).toContain('Connexion au serveur impossible.');
  });

  it('hors ligne : la dernière copie locale est affichée', async () => {
    const compte = crypto.randomUUID();
    const base = new BaseHorsLigne(compte);
    const recueLe = '2026-10-09T18:00:00.000Z';
    await base.lectures.bulkPut([
      { route: '/api/cellar', corps: CAVE, recueLe },
      { route: '/api/bottles', corps: { bottles: BOUTEILLES }, recueLe },
    ]);
    base.close();
    enLigne = false;
    simulerServeur({
      [REFRESH]: Response.json({ access_token: jwt(compte), expires_in: 900 }),
      'GET /api/cellar': reseauCoupe,
      'GET /api/bottles': reseauCoupe,
      'POST /api/sync': reseauCoupe,
    });

    ouvrir('/');

    expect(await screen.findByRole('region', { name: 'Cave du bas' })).toBeTruthy();
    expect(within(section('Hors rangement')).getByText('c9')).toBeTruthy();
  });
});

describe('Armoire : vue visuelle et modification', () => {
  it('étagères vues de face : une alvéole occupée par bouteille, de la couleur de son type', async () => {
    simulerServeur(LECTURES);

    ouvrir('/cabinets/3');

    const armoire = await screen.findByRole('region', { name: 'Cave du bas' });
    expect(screen.getByRole('heading', { level: 1, name: 'Cave du bas' })).toBeTruthy();
    const etageres = armoire.querySelectorAll('.ivt-shelf');
    expect(etageres).toHaveLength(2);
    const occupees = [...etageres[0].querySelectorAll('.ivt-alveole[data-wine]')].map((a) => a.getAttribute('data-wine'));
    expect(occupees).toEqual(['rouge', 'blanc']);
    expect(etageres[0].querySelectorAll('.ivt-alveole')).toHaveLength(12);
    expect(etageres[1].textContent).toContain('0 / 4 alvéoles');
    expect(screen.getByRole('link', { name: 'Modifier Étagère 1' }).getAttribute('href')).toBe('/shelves/12');
  });

  it('armoire inconnue : le dit, avec un lien vers la cave', async () => {
    simulerServeur(LECTURES);

    ouvrir('/cabinets/99');

    expect(await screen.findByText('Armoire introuvable')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir la cave' }).getAttribute('href')).toBe('/');
  });

  it('renommer : envoie le nouveau nom, puis l’affiche', async () => {
    const utilisateur = userEvent.setup();
    let nom = 'Cave du bas';
    const serveur = simulerServeur({
      ...LECTURES,
      'GET /api/cellar': () => Response.json({ ...CAVE, cabinets: [{ ...CAVE.cabinets[0], name: nom }] }),
      'PATCH /api/cabinets/3': async (requete) => {
        nom = ((await requete.clone().json()) as { name: string }).name;
        return Response.json({ ...CAVE.cabinets[0], name: nom });
      },
    });
    ouvrir('/cabinets/3');

    const champ = await screen.findByLabelText('Nom de l’armoire');
    expect((champ as HTMLInputElement).value).toBe('Cave du bas');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, 'Armoire de la cuisine');
    await utilisateur.click(screen.getByRole('button', { name: 'Renommer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Armoire de la cuisine' })).toBeTruthy();
    expect(await serveur.appels('PATCH /api/cabinets/3')[0].json()).toEqual({ name: 'Armoire de la cuisine' });
  });

  it('renommer avec un nom vide : refusé avant l’envoi', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur(LECTURES);
    ouvrir('/cabinets/3');

    await utilisateur.clear(await screen.findByLabelText('Nom de l’armoire'));
    await utilisateur.click(screen.getByRole('button', { name: 'Renommer' }));

    expect(screen.getByText(MESSAGES_EMPLACEMENT.nomManquant)).toBeTruthy();
    expect(serveur.appels('PATCH /api/cabinets/3')).toHaveLength(0);
  });

  it('ajouter une étagère : nom facultatif et capacité', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...LECTURES,
      'POST /api/cabinets/3/shelves': Response.json(
        { id: 14, name: null, position: 3, capacity: 6, occupied: 0 },
        { status: 201 },
      ),
    });
    ouvrir('/cabinets/3');

    const ajout = await screen.findByRole('region', { name: 'Ajouter une étagère' });
    await utilisateur.type(within(ajout).getByLabelText('Nombre d’alvéoles'), '6');
    await utilisateur.click(within(ajout).getByRole('button', { name: 'Ajouter' }));

    await vi.waitFor(() => expect(serveur.appels('POST /api/cabinets/3/shelves')).toHaveLength(1));
    expect(await serveur.appels('POST /api/cabinets/3/shelves')[0].json()).toEqual({ capacity: 6 });
    await vi.waitFor(() => expect(serveur.appels('GET /api/cellar').length).toBeGreaterThan(1));
  });

  it('supprimer une armoire non vide : annonce le passage en Hors rangement, puis revient à la cave', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...LECTURES,
      'DELETE /api/cabinets/3': Response.json({ moved_to_unplaced: 2 }),
    });
    ouvrir('/cabinets/3');

    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer l’armoire' }));
    const feuille = screen.getByRole('dialog', { name: 'Supprimer l’armoire' });
    expect(feuille.textContent).toContain('Les 2 bouteilles de cette armoire passeront en Hors rangement.');
    await utilisateur.click(within(feuille).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();
    expect(serveur.appels('DELETE /api/cabinets/3')).toHaveLength(1);
  });

  it('supprimer : Annuler ferme la feuille sans rien envoyer', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur(LECTURES);
    ouvrir('/cabinets/3');

    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer l’armoire' }));
    await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(serveur.appels('DELETE /api/cabinets/3')).toHaveLength(0);
  });

  it('hors ligne : consultation seule, modifications désactivées (réseau requis)', async () => {
    enLigne = false;
    simulerServeur(LECTURES);

    ouvrir('/cabinets/3');

    expect(await screen.findByRole('region', { name: 'Cave du bas' })).toBeTruthy();
    expect(screen.getByText(MESSAGES_EMPLACEMENT.reseauRequis)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Renommer' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Supprimer l’armoire' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Nouvelle armoire', () => {
  it('nom et étagères (une ligne par défaut, d’autres à la demande) ; ouvre l’armoire créée', async () => {
    const utilisateur = userEvent.setup();
    const creee = {
      id: 7,
      name: 'Armoire de la cuisine',
      shelves: [
        { id: 20, name: null, position: 1, capacity: 12, occupied: 0 },
        { id: 21, name: 'Magnums', position: 2, capacity: 4, occupied: 0 },
      ],
    };
    const serveur = simulerServeur({
      ...LECTURES,
      'POST /api/cabinets': Response.json(creee, { status: 201 }),
      'GET /api/cellar': () => Response.json({ ...CAVE, cabinets: [...CAVE.cabinets, creee] }),
    });
    ouvrir('/cabinets/new');

    await utilisateur.type(await screen.findByLabelText('Nom de l’armoire'), 'Armoire de la cuisine');
    await utilisateur.type(screen.getByLabelText('Étagère 1 : nombre d’alvéoles'), '12');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une étagère' }));
    await utilisateur.type(screen.getByLabelText('Étagère 2 : nom (facultatif)'), 'Magnums');
    await utilisateur.type(screen.getByLabelText('Étagère 2 : nombre d’alvéoles'), '4');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer l’armoire' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Armoire de la cuisine' })).toBeTruthy();
    expect(await serveur.appels('POST /api/cabinets')[0].json()).toEqual({
      name: 'Armoire de la cuisine',
      shelves: [{ capacity: 12 }, { name: 'Magnums', capacity: 4 }],
    });
  });

  it('retirer une ligne d’étagère', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(LECTURES);
    ouvrir('/cabinets/new');

    await utilisateur.click(await screen.findByRole('button', { name: 'Ajouter une étagère' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Retirer l’étagère 1' }));

    expect(screen.queryByLabelText('Étagère 2 : nombre d’alvéoles')).toBeNull();
    expect(screen.getByLabelText('Étagère 1 : nombre d’alvéoles')).toBeTruthy();
  });

  it('nom manquant, capacité absente ou hors bornes : refusés avant l’envoi', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur(LECTURES);
    ouvrir('/cabinets/new');

    await utilisateur.click(await screen.findByRole('button', { name: 'Ajouter une étagère' }));
    await utilisateur.type(screen.getByLabelText('Étagère 2 : nombre d’alvéoles'), '70000');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer l’armoire' }));

    expect(screen.getByText(MESSAGES_EMPLACEMENT.nomManquant)).toBeTruthy();
    expect(erreursDeChamp(MESSAGES_EMPLACEMENT.capaciteInvalide)).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByLabelText('Nom de l’armoire'));
    expect(serveur.appels('POST /api/cabinets')).toHaveLength(0);
  });

  it('refus du serveur : son message', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...LECTURES,
      'POST /api/cabinets': erreur(400, 'VALIDATION_FAILED', 'Champ « name » invalide.'),
    });
    ouvrir('/cabinets/new');

    await utilisateur.type(await screen.findByLabelText('Nom de l’armoire'), 'Cave');
    await utilisateur.type(screen.getByLabelText('Étagère 1 : nombre d’alvéoles'), '6');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer l’armoire' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Champ « name » invalide.');
  });

  it('hors ligne : création désactivée (réseau requis)', async () => {
    enLigne = false;
    simulerServeur(LECTURES);

    ouvrir('/cabinets/new');

    expect(await screen.findByText(MESSAGES_EMPLACEMENT.reseauRequis)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Créer l’armoire' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Étagère : modification et suppression', () => {
  it('nom et capacité ; un nom vidé est effacé (null), revient à l’armoire', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...LECTURES,
      'PATCH /api/shelves/13': Response.json({ id: 13, name: null, position: 2, capacity: 6, occupied: 0 }),
    });
    ouvrir('/shelves/13');

    expect(await screen.findByRole('heading', { level: 1, name: 'Magnums' })).toBeTruthy();
    expect(screen.getByText('Cave du bas')).toBeTruthy();
    await utilisateur.clear(screen.getByLabelText('Nom (facultatif)'));
    const capacite = screen.getByLabelText('Nombre d’alvéoles');
    await utilisateur.clear(capacite);
    await utilisateur.type(capacite, '6');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Cave du bas' })).toBeTruthy();
    expect(await serveur.appels('PATCH /api/shelves/13')[0].json()).toEqual({ name: null, capacity: 6 });
  });

  it('capacité sous l’occupation : refusée avant l’envoi, avec l’occupation actuelle', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur(LECTURES);
    ouvrir('/shelves/12');

    const capacite = await screen.findByLabelText('Nombre d’alvéoles');
    await utilisateur.clear(capacite);
    await utilisateur.type(capacite, '1');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(screen.getByText('Capacité inférieure à l’occupation actuelle : 2 bouteilles rangées.')).toBeTruthy();
    expect(serveur.appels('PATCH /api/shelves/12')).toHaveLength(0);
  });

  it('refus du serveur (occupation changée entre-temps) : son message', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...LECTURES,
      'PATCH /api/shelves/13': erreur(
        409,
        'CAPACITY_BELOW_OCCUPANCY',
        'Capacité inférieure à l’occupation actuelle : 3 bouteilles rangées.',
      ),
    });
    ouvrir('/shelves/13');

    const capacite = await screen.findByLabelText('Nombre d’alvéoles');
    await utilisateur.clear(capacite);
    await utilisateur.type(capacite, '2');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect((await screen.findByRole('alert')).textContent).toContain('3 bouteilles rangées');
  });

  it('supprimer une étagère non vide : annonce le passage en Hors rangement, revient à l’armoire', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({ ...LECTURES, 'DELETE /api/shelves/12': Response.json({ moved_to_unplaced: 2 }) });
    ouvrir('/shelves/12');

    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer l’étagère' }));
    const feuille = screen.getByRole('dialog', { name: 'Supprimer l’étagère' });
    expect(feuille.textContent).toContain('Les 2 bouteilles de cette étagère passeront en Hors rangement.');
    await utilisateur.click(within(feuille).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Cave du bas' })).toBeTruthy();
    expect(serveur.appels('DELETE /api/shelves/12')).toHaveLength(1);
  });

  it('supprimer une étagère vide : le dit', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(LECTURES);
    ouvrir('/shelves/13');

    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer l’étagère' }));

    expect(screen.getByRole('dialog').textContent).toContain('Aucune bouteille n’est rangée sur cette étagère.');
  });

  it('étagère inconnue : le dit', async () => {
    simulerServeur(LECTURES);

    ouvrir('/shelves/99');

    expect(await screen.findByText('Étagère introuvable')).toBeTruthy();
  });
});

describe('Cartons', () => {
  it('créer un carton : identifiant et capacité ; ouvre le carton créé', async () => {
    const utilisateur = userEvent.setup();
    const cree = { id: 8, label: 'Carton Loire', capacity: 12, occupied: 0 };
    const serveur = simulerServeur({
      ...LECTURES,
      'POST /api/boxes': Response.json(cree, { status: 201 }),
      'GET /api/cellar': () => Response.json({ ...CAVE, boxes: [...CAVE.boxes, cree] }),
    });
    ouvrir('/boxes/new');

    await utilisateur.type(await screen.findByLabelText('Identifiant du carton'), 'Carton Loire');
    await utilisateur.type(screen.getByLabelText('Nombre de bouteilles'), '12');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer le carton' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Carton Loire' })).toBeTruthy();
    expect(await serveur.appels('POST /api/boxes')[0].json()).toEqual({ label: 'Carton Loire', capacity: 12 });
  });

  it('créer un carton : saisie invalide refusée avant l’envoi', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur(LECTURES);
    ouvrir('/boxes/new');

    await utilisateur.type(await screen.findByLabelText('Nombre de bouteilles'), '0');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer le carton' }));

    expect(screen.getByText(MESSAGES_EMPLACEMENT.identifiantManquant)).toBeTruthy();
    expect(erreursDeChamp(MESSAGES_EMPLACEMENT.capaciteInvalide)).toHaveLength(1);
    expect(serveur.appels('POST /api/boxes')).toHaveLength(0);
  });

  it('carton : ses bouteilles, modification de l’identifiant et de la capacité', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...LECTURES,
      'PATCH /api/boxes/4': Response.json({ id: 4, label: 'Carton Médoc', capacity: 8, occupied: 1 }),
    });
    ouvrir('/boxes/4');

    expect(await screen.findByRole('heading', { level: 1, name: 'Carton Bordeaux' })).toBeTruthy();
    expect(screen.getByText('1 / 6 bouteilles')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Domaine b2/ }).getAttribute('href')).toBe('/bottles/43');

    const identifiant = screen.getByLabelText('Identifiant du carton');
    await utilisateur.clear(identifiant);
    await utilisateur.type(identifiant, 'Carton Médoc');
    const capacite = screen.getByLabelText('Nombre de bouteilles');
    await utilisateur.clear(capacite);
    await utilisateur.type(capacite, '8');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await vi.waitFor(() => expect(serveur.appels('PATCH /api/boxes/4')).toHaveLength(1));
    expect(await serveur.appels('PATCH /api/boxes/4')[0].json()).toEqual({ label: 'Carton Médoc', capacity: 8 });
  });

  it('supprimer un carton non vide : annonce le passage en Hors rangement, revient à la cave', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({ ...LECTURES, 'DELETE /api/boxes/4': Response.json({ moved_to_unplaced: 1 }) });
    ouvrir('/boxes/4');

    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer le carton' }));
    const feuille = screen.getByRole('dialog', { name: 'Supprimer le carton' });
    expect(feuille.textContent).toContain('La bouteille de ce carton passera en Hors rangement.');
    await utilisateur.click(within(feuille).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();
    expect(serveur.appels('DELETE /api/boxes/4')).toHaveLength(1);
  });

  it('carton inconnu : le dit', async () => {
    simulerServeur(LECTURES);

    ouvrir('/boxes/99');

    expect(await screen.findByText('Carton introuvable')).toBeTruthy();
  });
});
