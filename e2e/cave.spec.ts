import { expect, test, type Page } from '@playwright/test';

import { compteConnecte, MOT_DE_PASSE } from './compte';

// Recette de l'étape 6a dans Chrome, contre la doublure Docker : vue de la cave, armoire et
// cartons créés, modifiés et supprimés depuis la PWA ; hors ligne, la cave reste consultable
// (copie locale) et ses emplacements ne se modifient pas (P7). Les bouteilles arrivent par
// /api/sync, l'écran d'ajout étant celui de l'étape 7.

async function seConnecter(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
}

test('armoire à deux étagères : création, vue visuelle, renommage, suppression d’une étagère non vide', async ({
  page,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  const headers = { Authorization: `Bearer ${jeton}` };
  await seConnecter(page, email);
  await expect(page.getByText('Aucun emplacement.', { exact: false })).toBeVisible();

  await page.getByRole('link', { name: 'Ajouter une armoire' }).click();
  await page.getByLabel('Nom de l’armoire').fill('Armoire de la cuisine');
  await page.getByLabel('Étagère 1 : nombre d’alvéoles').fill('6');
  await page.getByRole('button', { name: 'Ajouter une étagère' }).click();
  await page.getByLabel('Étagère 2 : nom (facultatif)').fill('Magnums');
  await page.getByLabel('Étagère 2 : nombre d’alvéoles').fill('2');
  await page.getByRole('button', { name: 'Créer l’armoire' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Armoire de la cuisine' })).toBeVisible();
  const idArmoire = Number(/\/cabinets\/(\d+)$/.exec(page.url())?.[1]);

  // Deux bouteilles rangées sur l'étagère 1, par la synchronisation.
  const cave = (await (await request.get('/api/cellar', { headers })).json()) as {
    cabinets: { id: number; shelves: { id: number }[] }[];
  };
  const etagere1 = cave.cabinets.find((a) => a.id === idArmoire)?.shelves[0].id;
  const sync = await request.post('/api/sync', {
    headers,
    data: {
      mutations: [
        {
          client_ref: crypto.randomUUID(),
          schema_version: 1,
          kind: 'add',
          occurred_at: new Date().toISOString(),
          bottles: [{ client_ref: crypto.randomUUID() }, { client_ref: crypto.randomUUID() }],
          fields: { type: 'blanc', entry_date: '2026-10', origin: 'achetee', domain: 'Domaine Delaunay' },
          location: { type: 'etagere', id: etagere1 },
        },
      ],
    },
  });
  expect(sync.status()).toBe(200);

  await page.reload();
  const armoire = page.getByRole('region', { name: 'Armoire de la cuisine' });
  await expect(armoire.locator('.ivt-shelf').first().locator('.ivt-alveole[data-wine="blanc"]')).toHaveCount(2);
  await expect(armoire.locator('.ivt-shelf').first()).toContainText('2 / 6 alvéoles');
  await expect(armoire.locator('.ivt-shelf').nth(1)).toContainText('Magnums');

  await page.getByLabel('Nom de l’armoire').fill('Cave du bas');
  await page.getByRole('button', { name: 'Renommer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave du bas' })).toBeVisible();

  await page.getByRole('link', { name: 'Modifier Étagère 1' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Étagère 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer l’étagère' }).click();
  const feuille = page.getByRole('dialog', { name: 'Supprimer l’étagère' });
  await expect(feuille).toContainText('Les 2 bouteilles de cette étagère passeront en Hors rangement.');
  await feuille.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave du bas' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cave du bas' }).locator('.ivt-shelf')).toHaveCount(1);

  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  const horsRangement = page.getByRole('region', { name: 'Hors rangement' });
  await expect(horsRangement).toContainText('2 bouteilles');
  await expect(horsRangement.getByRole('link', { name: /Domaine Delaunay/ })).toHaveCount(2);
});

test('carton : création, modification, suppression', async ({ page, request }) => {
  const { email } = await compteConnecte(request);
  await seConnecter(page, email);

  await page.getByRole('link', { name: 'Ajouter un carton' }).click();
  await page.getByLabel('Identifiant du carton').fill('Carton Loire');
  await page.getByLabel('Nombre de bouteilles').fill('12');
  await page.getByRole('button', { name: 'Créer le carton' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carton Loire' })).toBeVisible();
  await expect(page.getByText('0 / 12 bouteilles')).toBeVisible();

  await page.getByLabel('Nombre de bouteilles').fill('6');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('0 / 6 bouteilles')).toBeVisible();

  await page.getByRole('button', { name: 'Supprimer le carton' }).click();
  const feuille = page.getByRole('dialog', { name: 'Supprimer le carton' });
  await expect(feuille).toContainText('Aucune bouteille n’est rangée dans ce carton.');
  await feuille.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
  await expect(page.getByText('Aucun emplacement.', { exact: false })).toBeVisible();
});

test('hors ligne : la cave reste consultable, ses emplacements ne se modifient pas', async ({
  page,
  context,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  await request.post('/api/cabinets', {
    headers: { Authorization: `Bearer ${jeton}` },
    data: { name: 'Cave du bas', shelves: [{ capacity: 12 }] },
  });
  await seConnecter(page, email);
  await expect(page.getByRole('region', { name: 'Cave du bas' })).toBeVisible();

  // Le service worker contrôle la page dès le rechargement (comme la recette de l'étape 5).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole('link', { name: 'Cave du bas' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave du bas' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave du bas' })).toBeVisible();
  await expect(page.getByText('Réseau requis pour modifier les emplacements.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Renommer' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Supprimer l’armoire' })).toBeDisabled();

  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cave du bas' })).toContainText('0 / 12 alvéoles');
});
