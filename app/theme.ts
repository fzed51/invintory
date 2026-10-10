export type Theme = 'light' | 'dark';

/** Choix manuel, prioritaire sur prefers-color-scheme (design system §Intégration). */
const CLE = 'theme';
const REQUETE_SOMBRE = '(prefers-color-scheme: dark)';

/** Thème choisi à la main ; null : celui du système. */
export function themeChoisi(): Theme | null {
  try {
    const valeur = localStorage.getItem(CLE);
    return valeur === 'light' || valeur === 'dark' ? valeur : null;
  } catch {
    return null;
  }
}

function appliquer(): void {
  document.documentElement.dataset.theme = themeChoisi() ?? (window.matchMedia(REQUETE_SOMBRE).matches ? 'dark' : 'light');
}

/** Enregistre le choix (null : revenir au thème du système) et l'applique. */
export function choisirTheme(theme: Theme | null): void {
  try {
    if (theme === null) localStorage.removeItem(CLE);
    else localStorage.setItem(CLE, theme);
  } catch {
    // Stockage indisponible : le choix vaut pour cette page seulement.
    if (theme !== null) {
      document.documentElement.dataset.theme = theme;
      return;
    }
  }
  appliquer();
}

/**
 * Applique le thème, puis suit le système et les choix faits dans un autre onglet ; renvoie
 * la fonction d'arrêt.
 */
export function appliquerTheme(): () => void {
  const sombre = window.matchMedia(REQUETE_SOMBRE);
  const surStockage = (evenement: StorageEvent) => {
    if (evenement.key === CLE || evenement.key === null) appliquer();
  };
  appliquer();
  sombre.addEventListener('change', appliquer);
  window.addEventListener('storage', surStockage);
  return () => {
    sombre.removeEventListener('change', appliquer);
    window.removeEventListener('storage', surStockage);
  };
}
