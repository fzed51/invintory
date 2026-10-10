import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseHorsLigne } from '../../hors-ligne/base.ts';
import { ouvrir } from '../../test/application.tsx';
import { BOUTEILLES, CAVE, FICHE } from '../../test/cave.ts';
import { erreur, jeton, jwt, reseauCoupe, simulerServeur } from '../../test/serveur.ts';
import { MESSAGES_FICHE } from './regles.ts';

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
  // jsdom n'implémente pas les URL d'objets : la photo s'affiche par createObjectURL (contrat §11).
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const REFRESH = 'POST /api/auth/refresh';
const PHOTO = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
const SERVEUR = {
  [REFRESH]: jeton('j1'),
  'GET /api/cellar': Response.json(CAVE),
  'GET /api/bottles': Response.json({ bottles: BOUTEILLES }),
  'GET /api/bottles/41': Response.json(FICHE),
  'GET /api/bottles/41/photo': PHOTO,
  'GET /api/regions': Response.json({ regions: [{ id: 5, name: 'Bordeaux' }, { id: 6, name: 'Bourgogne' }] }),
  'GET /api/grapes': Response.json({ grapes: [{ id: 9, name: 'Merlot' }] }),
};

/** Valeur d'un attribut de la fiche (liste de définitions). */
function attribut(terme: string): string | null {
  const dt = [...document.querySelectorAll('dt')].find((e) => e.textContent === terme);
  return dt?.nextElementSibling?.textContent ?? null;
}

describe('Fiche bouteille', () => {
  it('tous les attributs (CdC §2.2), la référence et les badges', async () => {
    simulerServeur(SERVEUR);

    ouvrir('/bottles/41');

    expect(await screen.findByRole('heading', { level: 1, name: 'Domaine a7' })).toBeTruthy();
    expect(document.querySelector('.ivt-ref')?.textContent).toBe('a7');
    expect(screen.getByText('Rouge')).toBeTruthy();
    expect(attribut('Région')).toBe('Bordeaux');
    expect(attribut('Cépage')).toBe('Merlot');
    expect(attribut('Millésime')).toBe('2018');
    expect(attribut('Date d’entrée')).toBe('octobre 2026');
    expect(attribut('Origine')).toBe('Achetée');
    expect(attribut('Note')).toBe('Offert par Paul');
    expect(attribut('Souvenir')).toBe('Non');
    expect(attribut('Statut')).toBe('En cave');
    expect(attribut('Emplacement')).toBe('Cave du bas · Étagère 1');
    expect(screen.getByRole('link', { name: 'Cave du bas · Étagère 1' }).getAttribute('href')).toBe('/cabinets/3');
    expect(attribut('Date limite de consommation')).toBe('31 décembre 2026');
    expect(screen.getByRole('link', { name: 'Modifier' }).getAttribute('href')).toBe('/bottles/41/edit');
  });

  it('valeurs absentes : « non millésimé », « Non renseigné », badges souvenir et urgent', async () => {
    simulerServeur({
      ...SERVEUR,
      'GET /api/bottles/41': Response.json({
        ...FICHE,
        domain: null,
        region: null,
        grape: null,
        vintage: null,
        note: null,
        souvenir: true,
        urgent: true,
        has_photo: false,
      }),
    });

    ouvrir('/bottles/41');

    expect(await screen.findByRole('heading', { level: 1, name: 'Domaine non renseigné' })).toBeTruthy();
    expect(attribut('Millésime')).toBe('non millésimé');
    expect(attribut('Région')).toBe('Non renseignée');
    expect(attribut('Cépage')).toBe('Non renseigné');
    expect(attribut('Note')).toBe('Aucune');
    expect(attribut('Souvenir')).toBe('Oui');
    expect(screen.getByText('Souvenir', { selector: '.ivt-badge' })).toBeTruthy();
    expect(screen.getByText("À boire d'urgence")).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('historique des mouvements, du plus ancien au plus récent', async () => {
    simulerServeur(SERVEUR);

    ouvrir('/bottles/41');

    const historique = await screen.findByRole('region', { name: 'Historique' });
    const lignes = within(historique).getAllByRole('listitem').map((li) => li.textContent);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain('Entrée');
    expect(lignes[0]).toContain('vers Cave du bas · Étagère 1');
    expect(lignes[0]).toContain('7 octobre 2026');
    expect(lignes[1]).toContain('Déplacement');
    expect(lignes[1]).toContain('de Cave du bas · Étagère 1 vers Hors rangement');
  });

  it('bouteille sortie : statut, motif dans l’historique, pas d’emplacement', async () => {
    simulerServeur({
      ...SERVEUR,
      'GET /api/bottles/41': Response.json({
        ...FICHE,
        status: 'sortie',
        has_photo: false,
        movements: [
          ...FICHE.movements,
          {
            id: 90,
            client_ref: 'm-90',
            type: 'sortie',
            exit_reason: 'perdue_cassee',
            from: { type: 'hors_rangement' },
            to: null,
            occurred_at: '2026-10-09T12:00:00.000Z',
          },
        ],
      }),
    });

    ouvrir('/bottles/41');

    await screen.findByRole('region', { name: 'Historique' });
    expect(attribut('Statut')).toBe('Sortie');
    expect(attribut('Emplacement')).toBeNull();
    expect(screen.getAllByRole('listitem').at(-1)?.textContent).toContain('Sortie — Perdue-cassée');
  });

  it('photo : chargée avec le jeton puis affichée par une URL d’objet', async () => {
    const serveur = simulerServeur(SERVEUR);

    ouvrir('/bottles/41');

    const photo = await screen.findByRole('img', { name: 'Photo de la bouteille a7' });
    expect(photo.getAttribute('src')).toBe('blob:photo');
    expect(serveur.appels('GET /api/bottles/41/photo')[0].headers.get('Authorization')).toBe('Bearer j1');
  });

  it('photo injoignable : le dit, la fiche reste lisible', async () => {
    simulerServeur({ ...SERVEUR, 'GET /api/bottles/41/photo': reseauCoupe });

    ouvrir('/bottles/41');

    expect(await screen.findByText('Photo indisponible sans réseau.')).toBeTruthy();
    expect(attribut('Région')).toBe('Bordeaux');
  });

  it('bouteille inconnue : le dit, avec un lien vers la cave', async () => {
    simulerServeur({ ...SERVEUR, 'GET /api/bottles/99': erreur(404, 'NOT_FOUND', 'Ressource introuvable.') });

    ouvrir('/bottles/99');

    expect(await screen.findByRole('heading', { level: 1, name: 'Bouteille introuvable' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir la cave' })).toBeTruthy();
  });

  it('serveur en erreur, sans copie locale : le dit', async () => {
    simulerServeur({ ...SERVEUR, 'GET /api/bottles/41': erreur(500, 'INTERNAL_ERROR', 'Erreur interne.') });

    ouvrir('/bottles/41');

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Fiche indisponible');
    expect(alerte.textContent).toContain('Erreur interne.');
  });

  it('modifier une bouteille inconnue : le dit', async () => {
    simulerServeur({ ...SERVEUR, 'GET /api/bottles/99': erreur(404, 'NOT_FOUND', 'Ressource introuvable.') });

    ouvrir('/bottles/99/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Bouteille introuvable' })).toBeTruthy();
  });

  it('hors ligne, fiche jamais ouverte : attributs tirés de la copie de la liste, historique indisponible', async () => {
    const compte = crypto.randomUUID();
    const base = new BaseHorsLigne(compte);
    await base.lectures.put({ route: '/api/bottles', corps: { bottles: BOUTEILLES }, recueLe: '2026-10-09T18:00:00.000Z' });
    base.close();
    enLigne = false;
    simulerServeur({
      [REFRESH]: Response.json({ access_token: jwt(compte), expires_in: 900 }),
      'GET /api/bottles/41': reseauCoupe,
      'GET /api/bottles/41/photo': reseauCoupe,
      'POST /api/sync': reseauCoupe,
    });

    ouvrir('/bottles/41');

    expect(await screen.findByRole('heading', { level: 1, name: 'Domaine a7' })).toBeTruthy();
    expect(attribut('Emplacement')).toBe('Cave du bas · Étagère 1');
    expect(screen.getByText('Historique indisponible hors ligne.')).toBeTruthy();
  });

  it('depuis la cave : la carte ouvre la fiche dans l’application', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(SERVEUR);
    ouvrir('/');

    await utilisateur.click(await screen.findByRole('link', { name: /Domaine a7/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Domaine a7' })).toBeTruthy();
  });
});

describe('Modifier la fiche (en ligne, contrat §7.3)', () => {
  it('pré-remplie ; envoie tous les champs modifiables, puis revient à la fiche', async () => {
    const utilisateur = userEvent.setup();
    let fiche = FICHE;
    const serveur = simulerServeur({
      ...SERVEUR,
      'GET /api/bottles/41': () => Response.json(fiche),
      'PATCH /api/bottles/41': async (requete) => {
        const corps = (await requete.clone().json()) as { domain: string };
        fiche = { ...fiche, domain: corps.domain };
        return Response.json(fiche);
      },
    });
    ouvrir('/bottles/41/edit');

    const domaine = await screen.findByLabelText('Domaine');
    expect((domaine as HTMLInputElement).value).toBe('Domaine a7');
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('rouge');
    expect((screen.getByLabelText('Date d’entrée') as HTMLInputElement).value).toBe('2026-10');

    await utilisateur.clear(domaine);
    await utilisateur.type(domaine, 'Château Exemple');
    await utilisateur.selectOptions(screen.getByLabelText('Type'), 'blanc');
    await utilisateur.clear(screen.getByLabelText('Région'));
    await utilisateur.type(screen.getByLabelText('Région'), 'Bourgogne');
    await utilisateur.clear(screen.getByLabelText('Cépage'));
    await utilisateur.clear(screen.getByLabelText('Millésime'));
    fireEvent.change(screen.getByLabelText('Date d’entrée'), { target: { value: '2025-03' } });
    await utilisateur.click(screen.getByRole('radio', { name: 'Offerte' }));
    await utilisateur.click(screen.getByLabelText('Souvenir'));
    await utilisateur.clear(screen.getByLabelText('Note'));
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Château Exemple' })).toBeTruthy();
    expect(await serveur.appels('PATCH /api/bottles/41')[0].json()).toEqual({
      type: 'blanc',
      region: 'Bourgogne',
      grape: null,
      domain: 'Château Exemple',
      vintage: null,
      entry_date: '2025-03',
      origin: 'offerte',
      note: null,
      souvenir: true,
    });
  });

  it('autocomplétion : régions et cépages connus proposés', async () => {
    simulerServeur(SERVEUR);

    ouvrir('/bottles/41/edit');

    const region = await screen.findByLabelText('Région');
    await vi.waitFor(() => {
      const options = document.getElementById(region.getAttribute('list') ?? '')?.querySelectorAll('option');
      expect([...(options ?? [])].map((o) => o.value)).toEqual(['Bordeaux', 'Bourgogne']);
    });
    const cepage = screen.getByLabelText('Cépage');
    const options = document.getElementById(cepage.getAttribute('list') ?? '')?.querySelectorAll('option');
    expect([...(options ?? [])].map((o) => o.value)).toEqual(['Merlot']);
  });

  it('millésime hors bornes, date d’entrée absente : refusés avant l’envoi', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur(SERVEUR);
    ouvrir('/bottles/41/edit');

    const millesime = await screen.findByLabelText('Millésime');
    await utilisateur.clear(millesime);
    await utilisateur.type(millesime, '999');
    fireEvent.change(screen.getByLabelText('Date d’entrée'), { target: { value: '' } });
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(screen.getByText(MESSAGES_FICHE.millesimeInvalide)).toBeTruthy();
    expect(screen.getByText(MESSAGES_FICHE.dateEntreeInvalide)).toBeTruthy();
    expect(document.activeElement).toBe(millesime);
    expect(serveur.appels('PATCH /api/bottles/41')).toHaveLength(0);
  });

  it('refus du serveur : son message', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...SERVEUR,
      'PATCH /api/bottles/41': erreur(400, 'VALIDATION_FAILED', 'Champ « region » invalide.'),
    });
    ouvrir('/bottles/41/edit');

    await utilisateur.click(await screen.findByRole('button', { name: 'Enregistrer' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Champ « region » invalide.');
  });

  it('hors ligne : modification désactivée (réseau requis)', async () => {
    enLigne = false;
    simulerServeur(SERVEUR);

    ouvrir('/bottles/41/edit');

    expect(await screen.findByText(MESSAGES_FICHE.reseauRequis)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Recherche par référence (CdC §2.3)', () => {
  it('trouve la bouteille (casse et espaces ignorés) et ouvre sa fiche', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({ ...SERVEUR, 'GET /api/bottles/by-reference/a7': Response.json(FICHE) });
    ouvrir('/');

    await utilisateur.type(await screen.findByLabelText('Référence'), ' A7 ');
    await utilisateur.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Domaine a7' })).toBeTruthy();
    expect(serveur.appels('GET /api/bottles/by-reference/a7')).toHaveLength(1);
  });

  it('référence inconnue : le dit, on reste sur la cave', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...SERVEUR,
      'GET /api/bottles/by-reference/zz': erreur(404, 'NOT_FOUND', 'Ressource introuvable.'),
    });
    ouvrir('/');

    await utilisateur.type(await screen.findByLabelText('Référence'), 'zz');
    await utilisateur.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByText('Aucune bouteille avec la référence « zz ».')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Cave' })).toBeTruthy();
  });

  it('référence vide : refusée avant l’envoi', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur(SERVEUR);
    ouvrir('/');

    await utilisateur.click(await screen.findByRole('button', { name: 'Rechercher' }));

    expect(screen.getByText(MESSAGES_FICHE.referenceManquante)).toBeTruthy();
  });

  it('hors ligne : cherchée dans la copie locale des bouteilles en cave', async () => {
    const utilisateur = userEvent.setup();
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
      'GET /api/bottles/by-reference/c9': reseauCoupe,
      'GET /api/bottles/by-reference/zz': reseauCoupe,
      'GET /api/bottles/44': reseauCoupe,
      'POST /api/sync': reseauCoupe,
    });
    ouvrir('/');

    await utilisateur.type(await screen.findByLabelText('Référence'), 'zz');
    await utilisateur.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(
      await screen.findByText('Aucune bouteille en cave avec la référence « zz » dans la copie locale.'),
    ).toBeTruthy();

    await utilisateur.clear(screen.getByLabelText('Référence'));
    await utilisateur.type(screen.getByLabelText('Référence'), 'c9');
    await utilisateur.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Domaine c9' })).toBeTruthy();
  });
});
