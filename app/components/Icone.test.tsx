import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ICONES, Icone, type NomIcone } from './Icone.tsx';

afterEach(cleanup);

describe('Icone', () => {
  it('rend un SVG décoratif de 24 px en currentColor', () => {
    const { container } = render(<Icone nom="cave" />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('class')).toBe('ivt-icon');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
  });

  it('passe en 16 px avec la taille « sm »', () => {
    const { container } = render(<Icone nom="souvenir" taille="sm" />);

    expect(container.querySelector('svg')?.getAttribute('class')).toBe('ivt-icon ivt-icon--sm');
  });

  it.each(Object.keys(ICONES) as NomIcone[])('dessine l’icône « %s »', (nom) => {
    const { container } = render(<Icone nom={nom} />);

    expect(container.querySelector('svg')?.children.length).toBeGreaterThan(0);
  });
});
