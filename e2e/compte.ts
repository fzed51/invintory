import { expect, type APIRequestContext } from '@playwright/test';

// Comptes de test contre la doublure Docker d'auth-service (emails lisibles sur :8081/_doublure/emails).

export const DOUBLURE = process.env.E2E_AUTH_URL ?? 'http://localhost:8081';
export const MOT_DE_PASSE = 'motdepasse-solide';

/** Adresse neuve à chaque test : la base Docker n'est pas vidée entre deux lancements. */
export function adresse(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemple.fr`;
}

/** Valeur du cookie de session dans les en-têtes d'une réponse. */
export function ticket(setCookie: string | undefined): string {
  const valeur = /ivt_session=([^;]*)/.exec(setCookie ?? '')?.[1];
  expect(valeur, 'cookie ivt_session').toBeTruthy();
  return valeur ?? '';
}

export async function dernierLien(request: APIRequestContext, email: string): Promise<string> {
  const emails = (await (await request.get(`${DOUBLURE}/_doublure/emails?a=${encodeURIComponent(email)}`)).json()) as {
    lien: string | null;
  }[];
  const lien = emails.at(-1)?.lien;
  expect(lien, `lien envoyé à ${email}`).toBeTruthy();
  return lien ?? '';
}

/** Inscription, clic sur le lien reçu, puis connexion : renvoie le jeton d'accès et le ticket. */
export async function compteConnecte(request: APIRequestContext, email = adresse()) {
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
