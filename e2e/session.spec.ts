import { expect, test } from '@playwright/test';

import { adresse, compteConnecte, dernierLien, MOT_DE_PASSE } from './compte';

// Parcours de compte de la PWA dans Chrome, contre la doublure Docker complète (Apache +
// PHP-FPM + MySQL + doublure d'auth-service) : les liens « reçus par email » sont lus sur
// la doublure et ouverts dans la page, qui suit les redirections jusqu'à /auth/return.

test('inscription, lien de confirmation, connexion, session gardée au rechargement', async ({ page, request }) => {
  const email = adresse();
  await page.goto('/meals');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();

  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(page.getByText('Lien de confirmation envoyé')).toBeVisible();

  await page.goto(await dernierLien(request, email));
  await expect(page).toHaveURL(/\/auth\/return\?type=user_registration&status=confirmed$/);
  await expect(page.getByText('Adresse confirmée')).toBeVisible();

  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();

  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  await navigation.getByRole('link', { name: 'Repas' }).click();
  await expect(page).toHaveURL(/\/meals$/);
  await expect(navigation.getByRole('link', { name: 'Repas' })).toHaveAttribute('aria-current', 'page');

  // Jeton d'accès en mémoire, perdu au rechargement : le ticket (cookie HttpOnly) rouvre la session.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Repas' })).toBeVisible();
});

test('mot de passe oublié : lien reçu, nouveau mot de passe, reconnexion', async ({ page, request }) => {
  const { email } = await compteConnecte(request);
  const nouveau = 'nouveau-mot-de-passe';

  await page.goto('/password/forgot');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByRole('button', { name: 'Recevoir un lien' }).click();
  await expect(page.getByText('Si un compte existe pour cette adresse')).toBeVisible();

  // Page intermédiaire à bouton d'auth-service (anti-scanner, intégration §2.5), puis
  // callback : jeton en cookie ivt_reinit, retiré de l'URL, saisie du mot de passe.
  await page.goto(await dernierLien(request, email));
  await page.getByRole('button', { name: 'Choisir un nouveau mot de passe' }).click();
  await expect(page).toHaveURL(/\/password\/reset$/);
  await page.getByLabel('Nouveau mot de passe').fill(nouveau);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.getByText('Mot de passe changé')).toBeVisible();

  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(nouveau);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
});

test('identifiants refusés : message du serveur sur la page de connexion', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(adresse());
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByRole('alert')).toContainText('Connexion refusée');
  await expect(page).toHaveURL(/\/login$/);
});
