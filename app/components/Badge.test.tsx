import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WINE_TYPES } from '../design/wine-types.ts';
import { BadgeSouvenir, BadgeType, BadgeUrgent, Pastille } from './Badge.tsx';

afterEach(cleanup);

describe('BadgeType', () => {
  it.each(WINE_TYPES.map((w) => [w.id, w.label] as const))(
    'affiche la pastille et le libellé du type %s',
    (type, libelle) => {
      const { container } = render(<BadgeType type={type} />);
      const badge = container.firstElementChild;

      expect(badge?.className).toBe(`ivt-badge ivt-badge--${type}`);
      expect(badge?.querySelector('.ivt-badge__dot')).not.toBeNull();
      expect(badge?.textContent).toBe(libelle);
    },
  );
});

describe('BadgeSouvenir et BadgeUrgent', () => {
  it('affiche le badge souvenir avec son icône et son libellé', () => {
    const { container } = render(<BadgeSouvenir />);

    expect(container.firstElementChild?.className).toBe('ivt-badge ivt-badge--souvenir');
    expect(container.querySelector('svg.ivt-icon--sm')).not.toBeNull();
    expect(screen.getByText('Souvenir')).toBeTruthy();
  });

  it('affiche le badge « À boire d’urgence » plein', () => {
    const { container } = render(<BadgeUrgent />);

    expect(container.firstElementChild?.className).toBe('ivt-badge ivt-badge--urgent');
    expect(container.querySelector('svg.ivt-icon--sm')).not.toBeNull();
    expect(screen.getByText("À boire d'urgence")).toBeTruthy();
  });
});

describe('Pastille', () => {
  it('affiche le nombre avec un libellé accessible', () => {
    render(<Pastille nombre={3} libelle="3 catégories en manque" />);
    const pastille = screen.getByLabelText('3 catégories en manque');

    expect(pastille.className).toBe('ivt-pastille');
    expect(pastille.textContent).toBe('3');
  });

  it('ajoute une classe complémentaire', () => {
    render(<Pastille nombre={2} libelle="2 en manque" className="ivt-nav__pastille" />);

    expect(screen.getByLabelText('2 en manque').className).toBe('ivt-pastille ivt-nav__pastille');
  });

  it('ne s’affiche pas à zéro', () => {
    const { container } = render(<Pastille nombre={0} libelle="0 en manque" />);

    expect(container.innerHTML).toBe('');
  });
});
