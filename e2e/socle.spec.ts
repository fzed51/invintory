import { expect, test } from '@playwright/test';

// Vérifications du socle contre la doublure Docker (Apache + PHP-FPM + MySQL).

test('la PWA se charge et affiche la réponse de /api/health', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Invintory' })).toBeVisible();
  await expect(page.getByText('API disponible')).toBeVisible();
  await expect(page.getByText('Réponse de /api/health : {"status":"ok"}')).toBeVisible();
});

test('GET /api/health répond 200 en JSON', async ({ request }) => {
  const reponse = await request.get('/api/health');

  expect(reponse.status()).toBe(200);
  expect(reponse.headers()['content-type']).toBe('application/json');
  expect(await reponse.json()).toEqual({ status: 'ok' });
});

test('HEAD /api/health répond 200 sans corps', async ({ request }) => {
  const reponse = await request.head('/api/health');

  expect(reponse.status()).toBe(200);
  expect(await reponse.body()).toHaveLength(0);
});

test('une route API inconnue renvoie l’enveloppe 404', async ({ request }) => {
  const reponse = await request.get('/api/inconnue');

  expect(reponse.status()).toBe(404);
  expect(await reponse.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
});

test('une URL hors API est servie par la PWA (routage côté client)', async ({ request }) => {
  const reponse = await request.get('/une/page/quelconque');

  expect(reponse.status()).toBe(200);
  expect(reponse.headers()['content-type']).toContain('text/html');
});
