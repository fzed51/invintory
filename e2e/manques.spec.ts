import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { compteConnecte, MOT_DE_PASSE } from './compte';

// Recette de l'étape 8b dans Chrome, contre la doublure Docker : une catégorie créée sous
// son seuil fait apparaître la pastille et l'écran Manques ; une durée de garde changée
// recalcule les dates limites (serveur) et le tri « À boire en priorité » du repas.

type Vin = { domain: string; region: string; vintage: number };

/**
 * Trois rouges ; garde par défaut du rouge, 8 ans (contrat §7.1) : Clos Vieux 2023
 * (dépassée), Château Garde 2026, Domaine Est 2028.
 */
const VINS: Vin[] = [
  { domain: 'Château Garde', region: 'Bordeaux', vintage: 2018 },
  { domain: 'Domaine Est', region: 'Alsace', vintage: 2020 },
  { domain: 'Clos Vieux', region: 'Bordeaux', vintage: 2015 },
];

async function preparer(request: APIRequestContext, jeton: string) {
  const headers = { Authorization: `Bearer ${jeton}` };
  const carton = (await (
    await request.post('/api/boxes', { headers, data: { label: 'Carton manques', capacity: 6 } })
  ).json()) as { id: number };
  const reponse = await request.post('/api/sync', {
    headers,
    data: {
      mutations: VINS.map((vin) => ({
        client_ref: crypto.randomUUID(),
        schema_version: 1,
        kind: 'add',
        occurred_at: new Date().toISOString(),
        bottles: [{ client_ref: crypto.randomUUID() }],
        fields: { ...vin, type: 'rouge', entry_date: '2026-10', origin: 'achetee' },
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
const onglet = (page: Page, nom: string) =>
  page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: new RegExp(`^${nom}`) });

test('manques et durée de garde : pastille, écran Manques, dates limites et tri recalculés', async ({
  page,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  await preparer(request, jeton);
  await seConnecter(page, email);

  await onglet(page, 'Repas').click();
  await expect(domaines(page)).toHaveText(['Clos Vieux', 'Château Garde', 'Domaine Est']);
  await expect(page.getByLabel(/en manque/)).toHaveCount(0);

  // Catégorie Rouge · Bordeaux avec un seuil de 4 : 2 bouteilles en cave, il en manque 2.
  await onglet(page, 'Manques').click();
  await expect(page.getByText('Aucune catégorie sous son seuil.')).toBeVisible();
  await page.getByRole('link', { name: 'Gérer les catégories' }).click();
  await page.getByRole('link', { name: 'Nouvelle catégorie' }).click();
  await page.getByLabel('Type').selectOption('Rouge');
  await page.getByLabel('Région (facultative)').fill('Bordeaux');
  await page.getByLabel('Seuil minimum (facultatif)').fill('4');
  await page.getByRole('button', { name: 'Créer la catégorie' }).click();
  const categorie = page.getByRole('link', { name: /Rouge · Bordeaux/ });
  await expect(categorie).toContainText('Seuil : 4 · Sans durée de garde · 2 bouteilles en cave');
  await expect(page.getByLabel('1 catégorie en manque')).toBeVisible();

  await onglet(page, 'Manques').click();
  await expect(page.getByRole('status', { name: 'Rouge · Bordeaux sous son seuil' })).toContainText(
    'Il manque 2 bouteilles pour atteindre 4.',
  );
  const suggestions = page.getByRole('region', { name: 'Rouge · Bordeaux' }).getByRole('heading', { level: 3 });
  await expect(suggestions).toHaveCount(2);
  await expect(suggestions.filter({ hasText: 'Château Garde' })).toHaveCount(1);
  await expect(suggestions.filter({ hasText: 'Clos Vieux' })).toHaveCount(1);

  // Garde de 15 ans pour Bordeaux : Clos Vieux 2030, Château Garde 2033 ; seuil ramené à 2.
  await page.getByRole('link', { name: 'Gérer les catégories' }).click();
  await categorie.click();
  await page.getByLabel('Durée de garde en années (facultative)').fill('15');
  await page.getByLabel('Seuil minimum (facultatif)').fill('2');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(categorie).toContainText('Seuil : 2 · Garde : 15 ans · 2 bouteilles en cave');
  await expect(page.getByLabel(/en manque/)).toHaveCount(0);

  await onglet(page, 'Repas').click();
  await expect(domaines(page)).toHaveText(['Domaine Est', 'Clos Vieux', 'Château Garde']);
  await expect(page.getByText("À boire d'urgence")).toHaveCount(0);
  await page.getByRole('link', { name: /Clos Vieux/ }).click();
  await expect(page.getByText('31 décembre 2030')).toBeVisible();
});
