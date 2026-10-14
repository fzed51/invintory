import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { compteConnecte, MOT_DE_PASSE } from './compte';
import { PHOTO } from './photo';

// Recette de l'étape 7 dans Chrome, contre la doublure Docker : ajout en masse de 6 bouteilles
// hors ligne avec photo → retour du réseau → 6 références uniques, 6 photos et 6 miniatures
// distinctes ; blocage de capacité ; brouillon repris après un rechargement (P4).

type Lue = { reference: string; domain: string | null; has_photo: boolean; id: number; location: { type: string; label?: string } };

/** Cave du bas : Étagère 1 (12 alvéoles) ; Carton Loire (4 bouteilles). */
async function preparer(request: APIRequestContext, jeton: string) {
  const headers = { Authorization: `Bearer ${jeton}` };
  expect(
    (await request.post('/api/cabinets', { headers, data: { name: 'Cave du bas', shelves: [{ capacity: 12 }] } })).status(),
  ).toBe(201);
  const carton = (await (await request.post('/api/boxes', { headers, data: { label: 'Carton Loire', capacity: 4 } })).json()) as {
    id: number;
  };
  const bouteilles = async () => ((await (await request.get('/api/bottles', { headers })).json()) as { bottles: Lue[] }).bottles;
  return { headers, carton, bouteilles };
}

async function seConnecter(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
}

/** Codes de la réserve de l'appareil (IndexedDB du compte). */
async function codesEnReserve(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const nom = (await indexedDB.databases()).find((base) => base.name?.startsWith('invintory-'))?.name;
    if (nom === undefined) return 0;
    return await new Promise<number>((rendre) => {
      const ouverture = indexedDB.open(nom);
      ouverture.onsuccess = () => {
        const base = ouverture.result;
        if (!base.objectStoreNames.contains('reserve')) {
          base.close();
          rendre(0);
          return;
        }
        const compte = base.transaction('reserve').objectStore('reserve').count();
        compte.onsuccess = () => {
          base.close();
          rendre(compte.result);
        };
      };
    });
  });
}

/**
 * Fichiers photo d'une référence écrits depuis `depuis` (ms), sous `photos/{user_id}/` (dossier
 * du projet monté dans Docker). Chaque compte neuf reprend les mêmes codes : la date écarte
 * ceux des lancements précédents.
 */
function fichiersPhoto(reference: string, depuis: number): string[] {
  const racine = join(process.cwd(), 'photos');
  if (!existsSync(racine)) return [];
  return readdirSync(racine).flatMap((compte) =>
    [`${reference}.jpg`, `${reference}_thumb.jpg`]
      .map((nom) => join(racine, compte, nom))
      .filter((chemin) => existsSync(chemin) && statSync(chemin).mtimeMs >= depuis),
  );
}

test('hors ligne : 6 bouteilles en masse avec photo → au retour du réseau, 6 références, 6 photos et miniatures', async ({
  page,
  context,
  request,
}) => {
  // Scénario long : deux rechargements, l'envoi du lot et de sa photo, puis 12 lectures de photos.
  test.slow();
  const debut = Date.now() - 1000;
  const { email, jeton } = await compteConnecte(request);
  const { headers, bouteilles } = await preparer(request, jeton);
  await seConnecter(page, email);
  // Service worker actif, cave lue une fois en ligne (copie locale), réserve de codes remplie.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Cave du bas' })).toBeVisible();
  await expect.poll(() => codesEnReserve(page)).toBeGreaterThanOrEqual(6);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Ajouter une bouteille' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ajouter des bouteilles' })).toBeVisible();
  await page.getByLabel('Domaine').fill('Château Hors Ligne');
  await page.getByLabel('Millésime').fill('2019');
  await page.getByLabel('Nombre de bouteilles').fill('6');
  await page.getByLabel('Photo').setInputFiles({ name: 'etiquette.jpg', mimeType: 'image/jpeg', buffer: PHOTO });
  await expect(page.getByRole('img', { name: 'Aperçu de la photo' })).toBeVisible();
  const emplacement = page.getByRole('region', { name: 'Emplacement' });
  await expect(emplacement.getByText('Cave du bas · Étagère 1')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

  const confirmation = page.getByRole('status', { name: '6 bouteilles ajoutées' });
  await expect(confirmation).toBeVisible();
  const references = await confirmation.locator('.ivt-ref').allTextContents();
  expect(references).toHaveLength(6);
  expect(new Set(references).size).toBe(6);
  await expect(page.getByText('6 mouvements en attente de synchronisation. 1 photo en attente d’envoi.')).toBeVisible();

  await confirmation.getByRole('link', { name: 'Voir la cave' }).click();
  const etagere = page.getByRole('region', { name: 'Étagère 1' });
  await expect(etagere.getByText('6 / 12 alvéoles')).toBeVisible();
  await expect(etagere.getByText('En attente de synchronisation')).toHaveCount(6);
  expect(await bouteilles()).toHaveLength(0);

  await context.setOffline(false);
  await expect(page.getByText(/en attente de synchronisation|en attente d’envoi/)).toHaveCount(0);
  await expect(etagere.getByRole('link', { name: /Château Hors Ligne/ })).toHaveCount(6);

  const lues = await bouteilles();
  expect(lues.map((b) => b.reference).sort()).toEqual([...references].sort());
  expect(lues.every((b) => b.domain === 'Château Hors Ligne' && b.has_photo)).toBe(true);
  for (const { id } of lues) {
    for (const suffixe of ['photo', 'photo/thumbnail']) {
      const reponse = await request.get(`/api/bottles/${id}/${suffixe}`, { headers });
      expect(reponse.status()).toBe(200);
      expect(reponse.headers()['content-type']).toBe('image/jpeg');
    }
  }
  // Un fichier par bouteille, et sa miniature (Arch §5.2, §5.3) : 12 fichiers distincts.
  const fichiers = references.flatMap((reference) => fichiersPhoto(reference, debut));
  expect(new Set(fichiers).size).toBe(12);
});

test('capacité bloquante : un lot plus grand que la place du carton est refusé, puis ajouté à sa taille', async ({
  page,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  const { carton, bouteilles } = await preparer(request, jeton);
  await seConnecter(page, email);

  await page.goto(`/boxes/${carton.id}`);
  await page.getByRole('link', { name: 'Ajouter dans ce carton' }).click();
  const emplacement = page.getByRole('region', { name: 'Emplacement' });
  await expect(emplacement.getByText('Emplacement choisi')).toBeVisible();
  await expect(emplacement.getByText('Carton Loire')).toBeVisible();
  await page.getByLabel('Domaine').fill('Domaine du Lot');
  await page.getByLabel('Nombre de bouteilles').fill('5');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Place insuffisante : 4 places libres sur 4. Choisissez un autre emplacement ou ajoutez moins de bouteilles.',
  );
  await emplacement.getByRole('button', { name: 'Choisir manuellement' }).click();
  await expect(emplacement.getByRole('button', { name: 'Carton Loire, 0 bouteille sur 4, place insuffisante' })).toBeDisabled();
  expect(await bouteilles()).toHaveLength(0);

  await page.getByLabel('Nombre de bouteilles').fill('4');
  await emplacement.getByRole('button', { name: 'Carton Loire, 0 bouteille sur 4' }).click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByRole('status', { name: '4 bouteilles ajoutées' })).toBeVisible();
  await expect.poll(async () => (await bouteilles()).filter((b) => b.location.label === 'Carton Loire').length).toBe(4);
});

test('brouillon : la saisie survit à un rechargement, puis Abandonner l’efface (P4)', async ({ page, request }) => {
  const { email } = await compteConnecte(request);
  await seConnecter(page, email);

  await page.getByRole('link', { name: 'Ajouter une bouteille' }).click();
  await page.getByLabel('Domaine').fill('Château Interrompu');
  await page.getByLabel('Nombre de bouteilles').fill('3');
  await page.getByRole('radio', { name: 'Offerte' }).click();
  await page.reload();

  await expect(page.getByRole('status', { name: 'Saisie reprise' })).toBeVisible();
  await expect(page.getByLabel('Domaine')).toHaveValue('Château Interrompu');
  await expect(page.getByLabel('Nombre de bouteilles')).toHaveValue('3');
  await expect(page.getByRole('radio', { name: 'Offerte' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Abandonner' }).click();
  await expect(page.getByLabel('Domaine')).toHaveValue('');
  await page.reload();
  await expect(page.getByLabel('Domaine')).toHaveValue('');
  await expect(page.getByRole('status', { name: 'Saisie reprise' })).toHaveCount(0);
});
