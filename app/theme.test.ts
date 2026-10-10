import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appliquerTheme, choisirTheme, themeChoisi } from './theme.ts';

/** prefers-color-scheme simulé, modifiable pendant le test. */
function preferenceSysteme(sombre: boolean) {
  const auditeurs = new Set<() => void>();
  const requete = {
    matches: sombre,
    addEventListener: (_type: string, fn: () => void) => auditeurs.add(fn),
    removeEventListener: (_type: string, fn: () => void) => auditeurs.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => requete);
  return {
    changer(valeur: boolean) {
      requete.matches = valeur;
      auditeurs.forEach((fn) => fn());
    },
    auditeurs,
  };
}

const theme = () => document.documentElement.dataset.theme;
let arreter: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  arreter?.();
  arreter = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Thème (design system §Intégration)', () => {
  it('sans choix : suit prefers-color-scheme et ses changements', () => {
    const systeme = preferenceSysteme(true);

    arreter = appliquerTheme();
    expect(theme()).toBe('dark');

    systeme.changer(false);
    expect(theme()).toBe('light');
  });

  it('choix enregistré (localStorage « theme ») : prime sur le système, même quand il change', () => {
    const systeme = preferenceSysteme(false);
    localStorage.setItem('theme', 'dark');

    arreter = appliquerTheme();
    expect(theme()).toBe('dark');
    expect(themeChoisi()).toBe('dark');

    systeme.changer(false);
    expect(theme()).toBe('dark');
  });

  it('choisirTheme : enregistre et applique ; null rend la main au système', () => {
    preferenceSysteme(true);
    arreter = appliquerTheme();

    choisirTheme('light');
    expect(theme()).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');

    choisirTheme(null);
    expect(theme()).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(themeChoisi()).toBeNull();
  });

  it('valeur enregistrée inconnue : ignorée', () => {
    preferenceSysteme(false);
    localStorage.setItem('theme', 'sepia');

    arreter = appliquerTheme();

    expect(theme()).toBe('light');
    expect(themeChoisi()).toBeNull();
  });

  it('stockage indisponible : thème du système, choix sans effet durable mais sans erreur', () => {
    preferenceSysteme(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Bloqué', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Bloqué', 'SecurityError');
    });

    arreter = appliquerTheme();
    expect(theme()).toBe('dark');
    expect(() => choisirTheme('light')).not.toThrow();
  });

  it('choix fait dans un autre onglet (événement storage) : appliqué ici aussi', () => {
    preferenceSysteme(false);
    arreter = appliquerTheme();

    localStorage.setItem('theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));

    expect(theme()).toBe('dark');
  });

  it('arrêt : plus aucun suivi', () => {
    const systeme = preferenceSysteme(false);
    appliquerTheme()();

    expect(systeme.auditeurs.size).toBe(0);
    systeme.changer(true);
    expect(theme()).toBe('light');
  });
});
