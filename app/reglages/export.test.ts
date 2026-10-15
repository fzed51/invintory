import { describe, expect, it } from 'vitest';
import { nomDuFichier } from './export.ts';

describe('nomDuFichier (contrat §12)', () => {
  it('nom donné par Content-Disposition, guillemets ou non', () => {
    expect(nomDuFichier('attachment; filename="invintory-2026-10-15.zip"')).toBe('invintory-2026-10-15.zip');
    expect(nomDuFichier('attachment; filename=invintory-2026-10-15.zip')).toBe('invintory-2026-10-15.zip');
  });

  it('sans en-tête exploitable : invintory.zip', () => {
    expect(nomDuFichier(null)).toBe('invintory.zip');
    expect(nomDuFichier('attachment')).toBe('invintory.zip');
  });
});
