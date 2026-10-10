import { describe, expect, it } from 'vitest';
import { nomAppareil } from './appareil.ts';

describe('Nom de l’appareil (envoyé à la connexion, P35)', () => {
  it.each([
    [
      'Chrome sur Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    ],
    [
      'Edge sur Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    ],
    [
      'Opera sur Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
    ],
    ['Firefox sur Linux', 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'],
    ['Firefox sur Android', 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'],
    [
      'Chrome sur Android',
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    ],
    [
      'Samsung Internet sur Android',
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
    ],
    [
      'Safari sur iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ],
    [
      'Chrome sur iPad',
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
    ],
    [
      'Firefox sur iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
    ],
    [
      'Safari sur macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    ],
  ])('%s', (attendu, userAgent) => {
    expect(nomAppareil(userAgent)).toBe(attendu);
  });

  it('navigateur seul ou système seul reconnu : la partie connue', () => {
    expect(nomAppareil('Mozilla/5.0 (Windows NT 10.0) Inconnu/1.0')).toBe('Windows');
    expect(nomAppareil('Mozilla/5.0 (BeOS) Firefox/131.0')).toBe('Firefox');
  });

  it('rien de reconnu (jsdom, robot) : pas de nom', () => {
    expect(nomAppareil('Mozilla/5.0 (win32) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.1.0')).toBeNull();
    expect(nomAppareil('')).toBeNull();
  });
});
