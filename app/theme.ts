/** Applique le thème clair ou sombre d'après prefers-color-scheme, et suit ses changements. */
export function appliquerThemeAuto(): void {
  const sombre = window.matchMedia('(prefers-color-scheme: dark)')
  const appliquer = () => {
    document.documentElement.dataset.theme = sombre.matches ? 'dark' : 'light'
  }
  appliquer()
  sombre.addEventListener('change', appliquer)
}
