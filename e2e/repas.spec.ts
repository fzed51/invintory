import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { compteConnecte, MOT_DE_PASSE } from './compte';

// Recette de l'étape 8a dans Chrome, contre la doublure Docker : recherche pour un repas
// (filtres type, région, cépage ; tris « À boire en priorité » et « Par âge » ; badges),
// dates limites calculées par le serveur, puis la même recherche hors ligne.

type Vin = { domain: string; type: string; region: string; grape: string; vintage: number; souvenir?: boolean };

/**
 * Quatre bouteilles dans un carton. Dates limites (garde par défaut, contrat §7.1) :
 * Château Ancien 2018 (dépassée), Domaine Pinot 2027, Domaine Riesling 2027, Clos Souvenir 2029.
 */
const VINS: Vin[] = [
  { domain: 'Clos Souvenir', type: 'rouge', region: 'Bordeaux', grape: 'Merlot', vintage: 2021, souvenir: true },
  { domain: 'Domaine Riesling', type: 'blanc', region: 'Alsace', grape: 'Riesling', vintage: 2023 },
  { domain: 'Château Ancien', type: 'rouge', region: 'Bordeaux', grape: 'Merlot', vintage: 2010 },
  { domain: 'Domaine Pinot', type: 'rouge', region: 'Alsace', grape: 'Pinot noir', vintage: 2019 },
];

async function preparer(request: APIRequestContext, jeton: string) {
  const headers = { Authorization: `Bearer ${jeton}` };
  const carton = (await (
    await request.post('/api/boxes', { headers, data: { label: 'Carton repas', capacity: 6 } })
  ).json()) as { id: number };
  const reponse = await request.post('/api/sync', {
    headers,
    data: {
      mutations: VINS.map(({ souvenir = false, ...vin }) => ({
        client_ref: crypto.randomUUID(),
        schema_version: 1,
        kind: 'add',
        occurred_at: new Date().toISOString(),
        bottles: [{ client_ref: crypto.randomUUID() }],
        fields: { ...vin, souvenir, entry_date: '2026-10', origin: 'achetee' },
        location: { type: 'carton', id: carton.id },
      })),
    },
  });
  expect(reponse.status()).toBe(200);
}

async function seConnecter(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
}

const domaines = (page: Page) => page.getByRole('heading', { level: 3 });
const carte = (page: Page, domaine: string) => page.getByRole('link', { name: new RegExp(domaine) });

test('repas : filtres, tris et badges en ligne, puis la même recherche hors ligne', async ({
  page,
  context,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  await preparer(request, jeton);
  await seConnecter(page, email);

  await page.getByRole('link', { name: 'Repas', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Repas' })).toBeVisible();
  await expect(page.getByText('4 bouteilles')).toBeVisible();
  await expect(domaines(page)).toHaveText(['Château Ancien', 'Domaine Pinot', 'Domaine Riesling', 'Clos Souvenir']);
  await expect(carte(page, 'Château Ancien').getByText("À boire d'urgence")).toBeVisible();
  await expect(carte(page, 'Clos Souvenir').getByText('Souvenir', { exact: true })).toBeVisible();

  await page.getByRole('radio', { name: 'Par âge' }).click();
  await expect(domaines(page)).toHaveText(['Château Ancien', 'Domaine Pinot', 'Clos Souvenir', 'Domaine Riesling']);

  await page.getByLabel('Type').selectOption('Rouge');
  await page.getByLabel('Région').selectOption('Bordeaux');
  await expect(domaines(page)).toHaveText(['Château Ancien', 'Clos Souvenir']);
  await page.getByLabel('Cépage').selectOption('Riesling');
  await expect(page.getByText('Aucune bouteille ne correspond à ces filtres.')).toBeVisible();
  await page.getByLabel('Cépage').selectOption('Merlot');

  // Retour d'une fiche : filtres et tri retrouvés.
  await carte(page, 'Clos Souvenir').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clos Souvenir' })).toBeVisible();
  await page.goBack();
  await expect(domaines(page)).toHaveText(['Château Ancien', 'Clos Souvenir']);
  await expect(page.getByRole('radio', { name: 'Par âge' })).toHaveAttribute('aria-checked', 'true');

  await context.setOffline(true);
  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Repas', exact: true }).click();
  await expect(page.getByText('4 bouteilles')).toBeVisible();
  await expect(domaines(page)).toHaveText(['Château Ancien', 'Domaine Pinot', 'Domaine Riesling', 'Clos Souvenir']);
  await page.getByLabel('Type').selectOption('Blanc');
  await expect(domaines(page)).toHaveText(['Domaine Riesling']);
});
