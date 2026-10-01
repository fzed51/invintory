import { expect, test, type Page } from '@playwright/test';

// Contrôle des composants sur /catalogue (serveur de développement), dans un vrai navigateur.

const THEMES = [
  { valeur: 'light', libelle: 'Clair' },
  { valeur: 'dark', libelle: 'Sombre' },
] as const;

async function ouvrir(page: Page, theme: (typeof THEMES)[number]) {
  const erreurs: string[] = [];
  page.on('pageerror', (erreur) => erreurs.push(erreur.message));
  page.on('console', (message) => {
    if (message.type() === 'error') erreurs.push(message.text());
  });

  await page.goto('/catalogue');
  await page.getByRole('radio', { name: theme.libelle }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme.valeur);

  return erreurs;
}

for (const theme of THEMES) {
  test(`thème ${theme.libelle.toLowerCase()} : tous les composants s’affichent sans erreur`, async ({ page }, info) => {
    const erreurs = await ouvrir(page, theme);

    await expect(page.getByRole('heading', { level: 1, name: 'Catalogue des composants' })).toBeVisible();
    for (const section of ['Button', 'Badge', 'BottleCard', 'ShelfGrid', 'Field', 'SegmentedControl', 'Banner', 'Sheet', 'Icônes', 'BottomNav']) {
      await expect(page.getByRole('region', { name: section })).toBeVisible();
    }
    // Les polices du design system sont chargées (embarquées, pas de CDN).
    expect(await page.evaluate(() => document.fonts.check('600 22px "EB Garamond"'))).toBe(true);
    expect(await page.evaluate(() => document.fonts.check('400 16px "Albert Sans"'))).toBe(true);

    await page.screenshot({ path: info.outputPath(`catalogue-${theme.valeur}.png`), fullPage: true });
    expect(erreurs).toEqual([]);
  });
}

/** Cibles interactives visibles de moins de 44 px de haut, hors sélecteurs exclus. */
async function ciblesTropPetites(page: Page, exclues: string[] = []) {
  return page.evaluate((exclues) => {
    const selecteur = 'button, a[href], input, [role="radio"]';
    return [...document.querySelectorAll<HTMLElement>(selecteur)]
      .filter((element) => element.offsetParent !== null && !exclues.some((e) => element.matches(e)))
      .map((element) => {
        const { height, width } = element.getBoundingClientRect();
        const cible = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName;
        return { cible, height: Math.round(height), width: Math.round(width) };
      })
      .filter(({ height }) => height < 44);
  }, exclues);
}

for (const largeur of [320, 412]) {
  test(`toute cible tactile fait au moins 44 px de haut (écran de ${largeur} px)`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 900 });
    await ouvrir(page, THEMES[0]);

    // Écart connu du CSS du design system, suivi à part (P24) : voir plus bas.
    expect(await ciblesTropPetites(page, ['.ivt-alveole'])).toEqual([]);
  });
}

// Écarts du CSS du design system à son propre guide (« toute cible tactile fait au moins
// 44 px »), à trancher : ces tests échouent tant que l'écart existe et signaleront sa correction.
test('les options du contrôle segmenté font au moins 44 px de haut (P23)', async ({ page }) => {
  await ouvrir(page, THEMES[0]);

  for (const hauteur of await page.locator('.ivt-seg__opt').evaluateAll((o) => o.map((e) => e.getBoundingClientRect().height))) {
    expect(hauteur).toBeGreaterThanOrEqual(44);
  }
});

test('P24 : les alvéoles font au moins 44 px sur un écran de 320 px', async ({ page }) => {
  test.fail(true, 'P24 : grille fixe de 6 colonnes dans components.css');
  await page.setViewportSize({ width: 320, height: 900 });
  await ouvrir(page, THEMES[0]);

  for (const hauteur of await page.locator('.ivt-alveole').evaluateAll((o) => o.map((e) => e.getBoundingClientRect().height))) {
    expect(hauteur).toBeGreaterThanOrEqual(44);
  }
});

test('ShelfGrid : choisir une alvéole libre la sélectionne', async ({ page }) => {
  await ouvrir(page, THEMES[0]);
  const etagere = page.getByRole('region', { name: 'Étagère 2' });

  await etagere.getByRole('button', { name: 'Alvéole 12 : libre' }).click();

  await expect(etagere.getByRole('button', { name: 'Alvéole 12 : libre' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Étagère 1' }).getByRole('button', { disabled: false })).toHaveCount(0);
});

test('Sheet : modale, focus dedans, Échap ferme et rend le focus', async ({ page }) => {
  await ouvrir(page, THEMES[0]);
  const declencheur = page.getByRole('button', { name: 'Sortir la bouteille' });

  await declencheur.click();
  const feuille = page.getByRole('dialog', { name: 'Sortir la bouteille' });
  await expect(feuille).toBeVisible();
  expect(await feuille.evaluate((d) => d.contains(document.activeElement))).toBe(true);

  // Modale : le reste de la page est inerte.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await feuille.evaluate((d) => d.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(feuille).toBeHidden();
  await expect(declencheur).toBeFocused();
});

test('Field référence : la saisie est mise en minuscules', async ({ page }) => {
  await ouvrir(page, THEMES[0]);
  const champ = page.getByRole('textbox', { name: 'Référence' });

  await champ.pressSequentially('K7B');

  await expect(champ).toHaveValue('k7b');
});
