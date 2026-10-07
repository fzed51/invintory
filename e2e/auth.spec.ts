import { expect, test, type APIRequestContext } from '@playwright/test';

// Authentification contre la doublure Docker complète : Apache + PHP-FPM + MySQL + doublure
// d'auth-service (service « auth », emails lisibles sur :8081/_doublure/emails).

const DOUBLURE = process.env.E2E_AUTH_URL ?? 'http://localhost:8081';
const MOT_DE_PASSE = 'motdepasse-solide';

/** Adresse neuve à chaque test : la base Docker n'est pas vidée entre deux lancements. */
function adresse(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemple.fr`;
}

/** Valeur du cookie de session dans les en-têtes d'une réponse. */
function ticket(setCookie: string | undefined): string {
  const valeur = /ivt_session=([^;]*)/.exec(setCookie ?? '')?.[1];
  expect(valeur, 'cookie ivt_session').toBeTruthy();
  return valeur ?? '';
}

async function dernierLien(request: APIRequestContext, email: string): Promise<string> {
  const emails = (await (await request.get(`${DOUBLURE}/_doublure/emails?a=${encodeURIComponent(email)}`)).json()) as {
    lien: string | null;
  }[];
  const lien = emails.at(-1)?.lien;
  expect(lien, `lien envoyé à ${email}`).toBeTruthy();
  return lien ?? '';
}

/** Inscription, clic sur le lien reçu, puis connexion : renvoie le jeton d'accès et le ticket. */
async function compteConnecte(request: APIRequestContext, email = adresse()) {
  await request.post('/api/auth/register', { data: { email, password: MOT_DE_PASSE } });
  await request.get(await dernierLien(request, email), { maxRedirects: 0 });
  // Le navigateur suit la redirection d'auth-service vers notre callback.
  const connexion = await request.post('/api/auth/login', {
    data: { email, password: MOT_DE_PASSE, device: 'Playwright' },
  });
  expect(connexion.status()).toBe(200);
  const { access_token: jeton } = (await connexion.json()) as { access_token: string };
  return { email, jeton, ticket: ticket(connexion.headers()['set-cookie']) };
}

test('inscription : le lien reçu ramène au callback, qui redirige vers la PWA', async ({ request }) => {
  const email = adresse();
  const inscription = await request.post('/api/auth/register', { data: { email, password: MOT_DE_PASSE } });
  expect(inscription.status()).toBe(202);

  const lien = await request.get(await dernierLien(request, email), { maxRedirects: 0 });
  expect(lien.status()).toBe(302);
  const retour = lien.headers()['location'] ?? '';
  expect(retour).toBe('http://localhost:8080/api/auth/callback?type=user_registration&status=confirmed');

  const callback = await request.get(new URL(retour).pathname + new URL(retour).search, { maxRedirects: 0 });
  expect(callback.status()).toBe(302);
  expect(callback.headers()['location']).toBe('/auth/return?type=user_registration&status=confirmed');
  expect(callback.headers()['referrer-policy']).toBe('no-referrer');
});

test('connexion : ticket en cookie HttpOnly, jeton accepté à travers Apache (.htaccess)', async ({ request }) => {
  const { jeton } = await compteConnecte(request);

  const appareils = await request.get('/api/auth/devices', { headers: { Authorization: `Bearer ${jeton}` } });

  expect(appareils.status()).toBe(200);
  expect(((await appareils.json()) as { devices: { device: string }[] }).devices[0]?.device).toBe('Playwright');
});

test('le cookie de session est HttpOnly, Secure, SameSite=Strict et limité à /api/auth', async ({ request }) => {
  const email = adresse();
  await request.post('/api/auth/register', { data: { email, password: MOT_DE_PASSE } });
  await request.get(await dernierLien(request, email), { maxRedirects: 0 });

  const connexion = await request.post('/api/auth/login', { data: { email, password: MOT_DE_PASSE } });

  expect(connexion.headers()['set-cookie']).toMatch(
    /^ivt_session=[\w-]{43}; Path=\/api\/auth; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict$/,
  );
});

test('rafraîchir renouvelle le ticket ; l’ancien, rejoué aussitôt, demande de réessayer', async ({ request }) => {
  const { ticket: premier } = await compteConnecte(request);

  const rafraichi = await request.post('/api/auth/refresh', { headers: { Cookie: `ivt_session=${premier}` } });
  expect(rafraichi.status()).toBe(200);
  expect(ticket(rafraichi.headers()['set-cookie'])).not.toBe(premier);

  const rejeu = await request.post('/api/auth/refresh', { headers: { Cookie: `ivt_session=${premier}` } });
  expect(rejeu.status()).toBe(409);
});

test('déconnexion : le ticket ne permet plus de rafraîchir', async ({ request }) => {
  const { ticket: courant } = await compteConnecte(request);

  const deconnexion = await request.post('/api/auth/logout', { headers: { Cookie: `ivt_session=${courant}` } });
  expect(deconnexion.status()).toBe(204);

  const rafraichi = await request.post('/api/auth/refresh', { headers: { Cookie: `ivt_session=${courant}` } });
  expect(rafraichi.status()).toBe(401);
});

for (const methode of ['GET', 'HEAD'] as const) {
  test(`${methode} sur une route protégée sans jeton : 401`, async ({ request }) => {
    const reponse = await request.fetch('/api/account', { method: methode });

    expect(reponse.status()).toBe(401);
    expect(reponse.headers()['www-authenticate']).toBe('Bearer');
  });
}

test('HEAD /api/health reste public : 200', async ({ request }) => {
  expect((await request.head('/api/health')).status()).toBe(200);
});
