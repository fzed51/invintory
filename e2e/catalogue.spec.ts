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
    // Les polices du design system se chargent (embarquées, pas de CDN). Chargement attendu
    // avant la vérification (check() seul répond false tant qu’il est en cours) ; au moins une
    // police chargée (check() répond aussi true pour une famille inconnue).
    for (const police of ['600 22px "EB Garamond"', '400 16px "Albert Sans"']) {
      expect(await page.evaluate((p) => document.fonts.load(p).then((faces) => faces.length > 0 && document.fonts.check(p)), police)).toBe(true);
    }

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

    expect(await ciblesTropPetites(page)).toEqual([]);
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

for (const largeur of [320, 412]) {
  test(`une étagère tient sur une seule ligne, sans déborder (écran de ${largeur} px, P24)`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 900 });
    await ouvrir(page, THEMES[0]);

    const etageres = await page.locator('.ivt-armoire .ivt-shelf').evaluateAll((liste) =>
      liste.map((etagere) => {
        const cadre = etagere.getBoundingClientRect();
        const alveoles = [...etagere.querySelectorAll('.ivt-alveole')].map((a) => a.getBoundingClientRect());
        return {
          alveoles: alveoles.length,
          lignes: new Set(alveoles.map((a) => Math.round(a.top))).size,
          deborde: alveoles.some((a) => a.right > cadre.right + 0.5),
          hauteur: cadre.height,
        };
      }),
    );

    expect(etageres.map((e) => e.alveoles)).toEqual([6, 12, 20]);
    for (const etagere of etageres) {
      expect(etagere.lignes).toBe(1);
      expect(etagere.deborde).toBe(false);
      expect(etagere.hauteur).toBeGreaterThanOrEqual(44);
    }
  });
}

test('Armoire : on choisit une étagère entière ; une étagère pleine est refusée', async ({ page }) => {
  await ouvrir(page, THEMES[0]);
  const armoire = page.getByRole('region', { name: 'Armoire de la cuisine' });
  const etagere2 = armoire.getByRole('button', { name: /^Étagère 2,/ });

  await expect(etagere2).toHaveAttribute('aria-pressed', 'false');
  await etagere2.click();
  await expect(etagere2).toHaveAttribute('aria-pressed', 'true');

  await expect(armoire.getByRole('button', { name: /^Étagère 1, .*complète$/ })).toBeDisabled();
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
