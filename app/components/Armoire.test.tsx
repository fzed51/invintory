import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Armoire } from './Armoire.tsx';
import { ShelfGrid } from './ShelfGrid.tsx';

afterEach(cleanup);

describe('Armoire', () => {
  it('nomme la section par l’armoire et en fait un titre', () => {
    render(<Armoire nom="Armoire de la cuisine" />);
    const section = screen.getByRole('region', { name: 'Armoire de la cuisine' });

    expect(section.className).toBe('ivt-armoire');
    expect(within(section).getByRole('heading', { level: 2, name: 'Armoire de la cuisine' }).className).toBe(
      'ivt-armoire__name',
    );
  });

  it('titre masqué (l’écran porte déjà le nom) : la section garde son nom accessible', () => {
    render(<Armoire nom="Armoire de la cuisine" titreVisible={false} />);

    expect(screen.getByRole('region', { name: 'Armoire de la cuisine' })).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('empile les étagères, une ligne chacune, dans l’ordre donné', () => {
    render(
      <Armoire nom="Armoire de la cuisine">
        <ShelfGrid nom="Étagère 1" capacite={6} occupation={['rouge']} onChoisir={vi.fn()} />
        <ShelfGrid nom="Étagère 2" capacite={6} occupation={[]} onChoisir={vi.fn()} />
      </Armoire>,
    );

    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Étagère 1, 1 alvéole occupée sur 6',
      'Étagère 2, 0 alvéole occupée sur 6',
    ]);
  });

  it('affiche une seule légende : Libre, Occupée, Proposée', () => {
    render(
      <Armoire nom="Armoire du cellier">
        <ShelfGrid nom="Étagère 1" capacite={6} occupation={[]} />
        <ShelfGrid nom="Étagère 2" capacite={6} occupation={[]} />
      </Armoire>,
    );
    const legendes = document.querySelectorAll('.ivt-legend');

    expect(legendes).toHaveLength(1);
    expect([...legendes[0].querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Libre',
      'Occupée',
      'Proposée',
    ]);
  });
});
