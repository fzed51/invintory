import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { compteConnecte, MOT_DE_PASSE } from './compte';

// Recette de l'étape 6 (6c) dans Chrome, contre la doublure Docker : Déplacer (proposition,
// autre emplacement, choix manuel, étagère complète refusée), Sortir (motif, confirmation),
// vue Hors rangement ; puis les mêmes gestes hors ligne, avec la recherche par référence,
// envoyés une seule fois au retour du réseau.

type Ajoutee = { client_ref: string; id: number; reference: string };

/**
 * Cave du bas : Étagère 1 (3 alvéoles, bouteilles A et B), Magnums (1 alvéole, bouteille C :
 * complète) ; cartons Bordeaux (6) et Loire (2), vides.
 */
async function preparer(request: APIRequestContext, jeton: string) {
  const headers = { Authorization: `Bearer ${jeton}` };
  const armoire = (await (
    await request.post('/api/cabinets', {
      headers,
      data: { name: 'Cave du bas', shelves: [{ capacity: 3 }, { name: 'Magnums', capacity: 1 }] },
    })
  ).json()) as { shelves: { id: number }[] };
  for (const [label, capacity] of [
    ['Carton Bordeaux', 6],
    ['Carton Loire', 2],
  ] as const) {
    expect((await request.post('/api/boxes', { headers, data: { label, capacity } })).status()).toBe(201);
  }
  const ajouter = async (n: number, domain: string, etagere: number) => {
    const reponse = await request.post('/api/sync', {
      headers,
      data: {
        mutations: [
          {
            client_ref: crypto.randomUUID(),
            schema_version: 1,
            kind: 'add',
            occurred_at: new Date().toISOString(),
            bottles: Array.from({ length: n }, () => ({ client_ref: crypto.randomUUID() })),
            fields: { type: 'rouge', entry_date: '2026-10', origin: 'achetee', domain },
            location: { type: 'etagere', id: etagere },
          },
        ],
      },
    });
    return ((await reponse.json()) as { results: { bottles: Ajoutee[] }[] }).results[0].bottles;
  };
  const [a, b] = await ajouter(2, 'Domaine Delaunay', armoire.shelves[0].id);
  const [c] = await ajouter(1, 'Château Magnum', armoire.shelves[1].id);
  const fiche = async (id: number) =>
    (await (await request.get(`/api/bottles/${id}`, { headers })).json()) as {
      status: string;
      location: { type: string; label?: string };
      movements: { type: string; exit_reason: string | null }[];
    };
  return { a, b, c, fiche };
}

async function seConnecter(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
}

async function ouvrirFiche(page: Page, reference: string) {
  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  await page.getByLabel('Référence').fill(reference);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByRole('region', { name: 'Historique' })).toBeVisible();
}

const attribut = (page: Page, terme: string) => page.locator('dt', { hasText: terme }).locator('+ dd');
const feuille = (page: Page, titre: string) => page.getByRole('dialog', { name: titre });

test('en ligne : déplacer (proposition, autre, manuel, complète refusée), Hors rangement, sortir', async ({
  page,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  const { a, b, c, fiche } = await preparer(request, jeton);
  await seConnecter(page, email);

  // A : proposition (Magnums complète, écartée), autre emplacement, puis choix manuel.
  await ouvrirFiche(page, a.reference);
  await page.getByRole('button', { name: 'Déplacer', exact: true }).click();
  let dialogue = feuille(page, 'Déplacer la bouteille');
  await expect(dialogue.getByText('Carton Bordeaux')).toBeVisible();
  await expect(dialogue.getByText('6 places libres')).toBeVisible();
  await dialogue.getByRole('button', { name: 'Autre emplacement' }).click();
  await expect(dialogue.getByText('Carton Loire')).toBeVisible();
  await dialogue.getByRole('button', { name: 'Choisir manuellement' }).click();
  await expect(dialogue.getByRole('button', { name: 'Magnums, 1 alvéole occupée sur 1, complète' })).toBeDisabled();
  await expect(dialogue.getByRole('button', { name: /^Étagère 1,/ })).toHaveCount(0);
  await dialogue.getByRole('button', { name: 'Carton Loire, 0 bouteille sur 2, proposé' }).click();
  await dialogue.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(dialogue).toBeHidden();
  await expect(attribut(page, 'Emplacement')).toHaveText('Carton Loire');
  await expect(page.getByRole('region', { name: 'Historique' }).getByRole('listitem').last()).toContainText(
    'de Cave du bas · Étagère 1 vers Carton Loire',
  );
  await expect.poll(async () => (await fiche(a.id)).location.label).toBe('Carton Loire');

  // B : Hors rangement en un geste, puis retour au rangement depuis la vue dédiée.
  await ouvrirFiche(page, b.reference);
  await page.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await feuille(page, 'Déplacer la bouteille').getByRole('button', { name: 'Hors rangement' }).click();
  await expect(attribut(page, 'Emplacement')).toHaveText('Hors rangement');
  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  await page.getByRole('region', { name: 'Hors rangement' }).getByRole('link', { name: 'Hors rangement', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hors rangement' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Domaine Delaunay/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Déplacer', exact: true }).click();
  dialogue = feuille(page, 'Déplacer la bouteille');
  await expect(dialogue.getByText('Cave du bas · Étagère 1')).toBeVisible();
  await dialogue.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(page.getByText('Aucune bouteille hors rangement.')).toBeVisible();
  await expect.poll(async () => (await fiche(b.id)).location.label).toBe('Cave du bas · Étagère 1');

  // C : sortie, motif obligatoire.
  await ouvrirFiche(page, c.reference);
  await page.getByRole('button', { name: 'Sortir', exact: true }).click();
  dialogue = feuille(page, 'Sortir la bouteille');
  await dialogue.getByRole('button', { name: 'Sortir', exact: true }).click();
  await expect(dialogue.getByText('Motif manquant. Choisir Consommée, Offerte ou Perdue-cassée.')).toBeVisible();
  await dialogue.getByRole('radio', { name: 'Consommée' }).click();
  await dialogue.getByRole('button', { name: 'Sortir', exact: true }).click();
  await expect(attribut(page, 'Statut')).toHaveText('Sortie');
  await expect(page.getByRole('button', { name: 'Sortir', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await fiche(c.id)).status).toBe('sortie');
  expect((await fiche(c.id)).movements.at(-1)).toMatchObject({ type: 'sortie', exit_reason: 'consommee' });

  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  const magnums = page.getByRole('region', { name: 'Magnums' });
  await expect(magnums.getByText('0 / 1 alvéoles')).toBeVisible();
});

test('hors ligne : recherche, déplacement et sortie visibles aussitôt, envoyés une fois au retour du réseau', async ({
  page,
  context,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  const { a, fiche } = await preparer(request, jeton);
  await seConnecter(page, email);
  // Le service worker contrôle la page ; la cave est lue une fois en ligne (copie locale).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Cave du bas' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();

  await ouvrirFiche(page, a.reference);
  await page.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await feuille(page, 'Déplacer la bouteille').getByRole('button', { name: 'Hors rangement' }).click();
  await expect(attribut(page, 'Emplacement')).toHaveText('Hors rangement');
  await expect(page.getByRole('region', { name: 'Historique' })).toContainText('En attente de synchronisation');
  await expect(page.getByText('1 mouvement en attente de synchronisation.')).toBeVisible();

  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Étagère 1' }).getByText('1 / 3 alvéoles')).toBeVisible();
  await page.getByRole('region', { name: 'Hors rangement' }).getByRole('link', { name: 'Hors rangement', exact: true }).click();
  await page.getByRole('button', { name: 'Sortir', exact: true }).click();
  const dialogue = feuille(page, 'Sortir la bouteille');
  await dialogue.getByRole('radio', { name: 'Offerte' }).click();
  await dialogue.getByRole('button', { name: 'Sortir', exact: true }).click();
  await expect(page.getByText('Aucune bouteille hors rangement.')).toBeVisible();
  await expect(page.getByText('2 mouvements en attente de synchronisation.')).toBeVisible();
  expect((await fiche(a.id)).status).toBe('en_cave');

  await context.setOffline(false);
  await expect(page.getByText(/en attente de synchronisation/)).toHaveCount(0);
  const finale = await fiche(a.id);
  expect(finale.status).toBe('sortie');
  expect(finale.movements.map((m) => [m.type, m.exit_reason])).toEqual([
    ['entree', null],
    ['deplacement', null],
    ['sortie', 'offerte'],
  ]);
});
