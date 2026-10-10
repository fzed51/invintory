import { expect, test, type Page } from '@playwright/test';

import { compteConnecte, MOT_DE_PASSE } from './compte';

// Recette de l'étape 5 (plan) dans Chrome, contre la doublure Docker : PWA servie par son
// service worker réseau coupé, mutation en file, envoyée une seule fois au retour du réseau.
// Les écrans d'ajout arrivent aux étapes 6 et 7 : la mutation est écrite directement dans la
// base IndexedDB du compte, sous la forme de la file (contrat §10.1, version 1).

/** Écrit une entrée dans la file de la base locale du compte. */
async function mettreEnFile(page: Page, compte: string, entree: object) {
  await page.evaluate(
    ({ nom, entree }) =>
      new Promise<void>((fin, echec) => {
        const ouverture = indexedDB.open(nom);
        ouverture.onerror = () => echec(ouverture.error);
        ouverture.onsuccess = () => {
          const base = ouverture.result;
          const transaction = base.transaction('file', 'readwrite');
          transaction.objectStore('file').add(entree);
          transaction.oncomplete = () => {
            base.close();
            fin();
          };
          transaction.onerror = () => echec(transaction.error);
        };
      }),
    { nom: `invintory-${compte}`, entree },
  );
}

test('hors ligne : rechargement par le service worker, mutation en file, envoyée une seule fois au retour du réseau', async ({
  page,
  context,
  request,
}) => {
  const { email, jeton } = await compteConnecte(request);
  const [lot, bouteille] = [crypto.randomUUID(), crypto.randomUUID()];
  const envois: string[] = [];
  page.on('request', (requete) => {
    if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/api/sync') envois.push(requete.postData() ?? '');
  });

  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
  const compte = await page.evaluate(() => localStorage.getItem('invintory.compte'));
  expect(compte).toBeTruthy();

  // Premier passage : le service worker s'installe ; il contrôle la page dès le rechargement.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
  await expect(page.getByText('Hors ligne')).toBeVisible();
  await expect(page.getByText('Les modifications seront envoyées au retour du réseau.')).toBeVisible();

  await mettreEnFile(page, compte ?? '', {
    client_ref: lot,
    schemaVersion: 1,
    mutation: {
      kind: 'add',
      occurred_at: new Date().toISOString(),
      bottles: [{ client_ref: bouteille }],
      fields: { type: 'rouge', entry_date: '2026-10', origin: 'achetee' },
      location: { type: 'hors_rangement' },
    },
  });
  await page.reload();
  await expect(page.getByText('1 mouvement en attente de synchronisation.')).toBeVisible();
  expect(envois).toHaveLength(0);

  await context.setOffline(false);

  await expect(page.getByText('Hors ligne')).toBeHidden();
  await expect(page.getByText(/en attente/)).toBeHidden();
  const { bottles } = (await (
    await request.get('/api/bottles?status=all', { headers: { Authorization: `Bearer ${jeton}` } })
  ).json()) as { bottles: { client_ref: string; status: string; location: { type: string } }[] };
  expect(bottles).toEqual([expect.objectContaining({ client_ref: bouteille, status: 'en_cave', location: { type: 'hors_rangement' } })]);

  // Rechargé en ligne : la file est vide, rien n'est renvoyé.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(envois.filter((corps) => corps.includes(lot))).toHaveLength(1);
});
