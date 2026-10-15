import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { compteConnecte, MOT_DE_PASSE } from './compte';

// Recette de l'étape 8c dans Chrome, contre la doublure Docker : thème, appareils connectés,
// export téléchargé et contenu vérifié, puis déconnexion.

async function preparer(request: APIRequestContext, jeton: string) {
  const headers = { Authorization: `Bearer ${jeton}` };
  const carton = (await (
    await request.post('/api/boxes', { headers, data: { label: 'Carton export', capacity: 6 } })
  ).json()) as { id: number };
  const reponse = await request.post('/api/sync', {
    headers,
    data: {
      mutations: [
        {
          client_ref: crypto.randomUUID(),
          schema_version: 1,
          kind: 'add',
          occurred_at: new Date().toISOString(),
          bottles: [{ client_ref: crypto.randomUUID() }, { client_ref: crypto.randomUUID() }],
          fields: { domain: 'Domaine Exporté', vintage: 2019, type: 'blanc', entry_date: '2026-10', origin: 'achetee' },
          location: { type: 'carton', id: carton.id },
        },
      ],
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

/** Fichiers d'une archive ZIP (répertoire central), décompressés. */
function lireZip(archive: Buffer): Map<string, Buffer> {
  const fin = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const nombre = archive.readUInt16LE(fin + 10);
  let position = archive.readUInt32LE(fin + 16);
  const fichiers = new Map<string, Buffer>();
  for (let i = 0; i < nombre; i++) {
    const methode = archive.readUInt16LE(position + 10);
    const taille = archive.readUInt32LE(position + 20);
    const longueurNom = archive.readUInt16LE(position + 28);
    const longueurs = archive.readUInt16LE(position + 30) + archive.readUInt16LE(position + 32);
    const local = archive.readUInt32LE(position + 42);
    const nom = archive.toString('utf8', position + 46, position + 46 + longueurNom);
    const debut = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const brut = archive.subarray(debut, debut + taille);
    fichiers.set(nom, methode === 8 ? inflateRawSync(brut) : brut);
    position += 46 + longueurNom + longueurs;
  }
  return fichiers;
}

test('réglages : thème, appareils, export téléchargé et vérifié, déconnexion', async ({ page, request }) => {
  const { email, jeton } = await compteConnecte(request);
  await preparer(request, jeton);
  await seConnecter(page, email);
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Réglages' }).click();

  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('radio', { name: 'Sombre' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Deux connexions : ce navigateur et celle ouverte par l'API (« Playwright »).
  const appareils = page.getByRole('list', { name: 'Appareils connectés' }).getByRole('listitem');
  await expect(appareils).toHaveCount(2);
  await page.getByRole('button', { name: 'Déconnecter Playwright' }).click();
  await expect(appareils).toHaveCount(1);
  await expect(appareils).toContainText('Cet appareil');

  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter la cave' }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toMatch(/^invintory-\d{4}-\d{2}-\d{2}\.zip$/);
  await expect(page.getByRole('status', { name: 'Export téléchargé' })).toContainText(fichier.suggestedFilename());

  const contenu = lireZip(await readFile(await fichier.path()));
  const donnees = JSON.parse(contenu.get('data.json')?.toString('utf8') ?? '{}') as {
    boxes: { label: string }[];
    bottles: { reference: string; domain: string; id?: unknown }[];
  };
  expect(donnees.boxes.map((carton) => carton.label)).toEqual(['Carton export']);
  expect(donnees.bottles).toHaveLength(2);
  for (const bouteille of donnees.bottles) {
    expect(bouteille.domain).toBe('Domaine Exporté');
    expect(bouteille.reference).toMatch(/\S/);
    expect(bouteille).not.toHaveProperty('id');
  }

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});
