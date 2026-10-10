import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { compteConnecte, MOT_DE_PASSE } from './compte';
import { PHOTO } from './photo';

// Recette de l'étape 6b dans Chrome, contre la doublure Docker : recherche par référence,
// fiche (attributs, photo, historique), modification en ligne ; hors ligne, recherche et
// fiche servies par les copies locales, modification désactivée (P7).

type Ajoutee = { client_ref: string; id: number; reference: string };

/** Une armoire, deux bouteilles rangées, la première déplacée puis photographiée. */
async function preparer(request: APIRequestContext, jeton: string): Promise<Ajoutee[]> {
  const headers = { Authorization: `Bearer ${jeton}` };
  const armoire = (await (
    await request.post('/api/cabinets', { headers, data: { name: 'Cave du bas', shelves: [{ capacity: 6 }] } })
  ).json()) as { shelves: { id: number }[] };
  const sync = async (mutations: object[]) =>
    ((await (await request.post('/api/sync', { headers, data: { mutations } })).json()) as {
      results: { bottles?: Ajoutee[] }[];
    }).results;
  const [ajout] = await sync([
    {
      client_ref: crypto.randomUUID(),
      schema_version: 1,
      kind: 'add',
      occurred_at: '2026-10-07T12:00:00.000Z',
      bottles: [{ client_ref: crypto.randomUUID() }, { client_ref: crypto.randomUUID() }],
      fields: {
        type: 'rouge',
        region: 'Bordeaux',
        grape: 'Merlot',
        domain: 'Château Exemple',
        vintage: 2018,
        entry_date: '2026-10',
        origin: 'achetee',
        note: 'Offert par Paul',
      },
      location: { type: 'etagere', id: armoire.shelves[0].id },
    },
  ]);
  const bouteilles = ajout.bottles ?? [];
  await sync([
    {
      client_ref: crypto.randomUUID(),
      schema_version: 1,
      kind: 'move',
      occurred_at: '2026-10-08T12:00:00.000Z',
      bottle: bouteilles[0].client_ref,
      location: { type: 'hors_rangement' },
    },
  ]);
  const photo = await request.put(`/api/photos/${bouteilles[0].client_ref}`, {
    headers: { ...headers, 'Content-Type': 'image/jpeg' },
    data: PHOTO,
  });
  expect(photo.status()).toBe(204);
  return bouteilles;
}

async function seConnecter(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
}

async function rechercher(page: Page, reference: string) {
  await page.getByLabel('Référence').fill(reference);
  await page.getByRole('button', { name: 'Rechercher' }).click();
}

/** Valeur d'un attribut de la fiche. */
const attribut = (page: Page, terme: string) => page.locator('dt', { hasText: terme }).locator('+ dd');

test('recherche par référence, fiche complète, modification', async ({ page, request }) => {
  const { email, jeton } = await compteConnecte(request);
  const [premiere] = await preparer(request, jeton);
  await seConnecter(page, email);

  await rechercher(page, ` ${premiere.reference.toUpperCase()} `);
  await expect(page.getByRole('heading', { level: 1, name: 'Château Exemple' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/bottles/${premiere.id}$`));
  await expect(attribut(page, 'Région')).toHaveText('Bordeaux');
  await expect(attribut(page, 'Cépage')).toHaveText('Merlot');
  await expect(attribut(page, 'Emplacement')).toHaveText('Hors rangement');
  const photo = page.getByRole('img', { name: `Photo de la bouteille ${premiere.reference}` });
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const historique = page.getByRole('region', { name: 'Historique' }).getByRole('listitem');
  await expect(historique).toHaveCount(2);
  await expect(historique.nth(0)).toContainText('Entrée');
  await expect(historique.nth(1)).toContainText('de Cave du bas · Étagère 1 vers Hors rangement');

  await page.getByRole('link', { name: 'Modifier' }).click();
  await page.getByLabel('Domaine').fill('Domaine Delaunay');
  await page.getByLabel('Région').fill('Jura');
  await page.getByLabel('Millésime').fill('');
  await page.getByLabel('Date d’entrée').fill('2025-03');
  await page.getByRole('radio', { name: 'Offerte' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Domaine Delaunay' })).toBeVisible();
  await expect(attribut(page, 'Région')).toHaveText('Jura');
  await expect(attribut(page, 'Millésime')).toHaveText('non millésimé');
  await expect(attribut(page, 'Date d’entrée')).toHaveText('mars 2025');
  await expect(attribut(page, 'Origine')).toHaveText('Offerte');

  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  await rechercher(page, 'zzz');
  await expect(page.getByText('Aucune bouteille avec la référence « zzz ».')).toBeVisible();
});

test('hors ligne : recherche et fiche depuis les copies locales, modification désactivée', async ({
  page,
  context,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  const [premiere, seconde] = await preparer(request, jeton);
  await seConnecter(page, email);
  // Le service worker contrôle la page ; la fiche de la première est ouverte une fois en ligne.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Cave du bas' })).toBeVisible();
  await rechercher(page, premiere.reference);
  await expect(page.getByRole('region', { name: 'Historique' }).getByRole('listitem')).toHaveCount(2);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Historique' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Photo indisponible sans réseau.')).toBeVisible();

  await page.getByRole('link', { name: 'Cave', exact: true }).click();
  await rechercher(page, seconde.reference);
  await expect(page.getByRole('heading', { level: 1, name: 'Château Exemple' })).toBeVisible();
  await expect(page.getByText('Historique indisponible hors ligne.')).toBeVisible();
  await expect(attribut(page, 'Emplacement')).toHaveText('Cave du bas · Étagère 1');

  await page.getByRole('link', { name: 'Modifier' }).click();
  await expect(page.getByText('Réseau requis pour modifier la fiche.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
});
