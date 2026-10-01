import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WineType } from '../design/wine-types.ts';
import { ShelfGrid } from './ShelfGrid.tsx';

afterEach(cleanup);

const neuf: WineType[] = ['rouge', 'rouge', 'blanc', 'rouge', 'rose', 'blanc', 'effervescent', 'doux', 'autre'];
const pleine: WineType[] = Array.from({ length: 12 }, () => 'rouge');

function alveoles(conteneur: HTMLElement) {
  return [...conteneur.querySelectorAll<HTMLElement>('.ivt-alveole')];
}

describe('ShelfGrid — une ligne = une étagère', () => {
  it('dessine toutes les alvéoles sur une seule ligne : occupées par type, puis libres', () => {
    const { container } = render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} />);
    const liste = alveoles(container);

    expect(container.querySelectorAll('.ivt-shelf__grid')).toHaveLength(1);
    expect(liste).toHaveLength(12);
    expect(liste.slice(0, 9).map((a) => a.dataset.wine)).toEqual(neuf);
    expect(liste.slice(9).every((a) => a.dataset.wine === undefined)).toBe(true);
  });

  it('les alvéoles sont un dessin : ni boutons, ni exposées aux lecteurs d’écran', () => {
    const { container } = render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} onChoisir={vi.fn()} />);

    expect(container.querySelector('.ivt-shelf__grid')?.getAttribute('aria-hidden')).toBe('true');
    expect(alveoles(container).every((a) => a.tagName === 'SPAN')).toBe(true);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('affiche le nom et le compteur', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} />);

    expect(screen.getByText('Étagère 2').className).toBe('ivt-shelf__name');
    expect(screen.getByText('9 / 12 alvéoles').className).toBe('ivt-shelf__count');
  });

  it('marque la première alvéole libre quand l’étagère est proposée', () => {
    const { container } = render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} proposee />);
    const liste = alveoles(container);

    expect(liste[9].className).toBe('ivt-alveole ivt-alveole--suggested');
    expect(liste.filter((a) => a.classList.contains('ivt-alveole--suggested'))).toHaveLength(1);
  });

  it('occupation au-delà de la capacité : toutes les bouteilles restent visibles', () => {
    const treize: WineType[] = Array.from({ length: 13 }, () => 'blanc');
    const { container } = render(<ShelfGrid nom="Étagère 1" capacite={12} occupation={treize} />);

    expect(alveoles(container)).toHaveLength(13);
    expect(screen.getByText('13 / 12 alvéoles')).toBeTruthy();
  });
});

describe('ShelfGrid — consultation seule', () => {
  it('sans action, l’étagère n’est pas un bouton et son nom est un titre', () => {
    const { container } = render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.firstElementChild?.className).toBe('ivt-shelf');
    expect(screen.getByRole('heading', { level: 3, name: 'Étagère 2' })).toBeTruthy();
  });
});

describe('ShelfGrid — choix de l’étagère', () => {
  it('l’étagère entière est un bouton, nommé par son nom et son occupation', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} onChoisir={vi.fn()} />);
    const bouton = screen.getByRole('button', { name: 'Étagère 2, 9 alvéoles occupées sur 12' });

    expect(bouton.className).toBe('ivt-shelf');
    expect(bouton.getAttribute('type')).toBe('button');
  });

  it('se choisit à la souris et au clavier', async () => {
    const choisir = vi.fn();
    const utilisateur = userEvent.setup();
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} onChoisir={choisir} />);

    await utilisateur.click(screen.getByRole('button'));
    await utilisateur.keyboard('{Enter}');
    await utilisateur.keyboard(' ');

    expect(choisir).toHaveBeenCalledTimes(3);
  });

  it('annonce l’emplacement proposé', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} proposee onChoisir={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Étagère 2, 9 alvéoles occupées sur 12, emplacement proposé' })).toBeTruthy();
  });

  it('marque la sélection', () => {
    const { rerender } = render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} onChoisir={vi.fn()} />);

    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');

    rerender(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} selectionnee onChoisir={vi.fn()} />);

    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button').className).toBe('ivt-shelf ivt-shelf--selected');
  });

  it('étagère pleine : désactivée, dit complète, ni proposée ni choisie', async () => {
    const choisir = vi.fn();
    const { container } = render(
      <ShelfGrid nom="Étagère 1" capacite={12} occupation={pleine} proposee onChoisir={choisir} />,
    );
    const bouton = screen.getByRole('button', { name: 'Étagère 1, 12 alvéoles occupées sur 12, complète' });

    await userEvent.click(bouton);

    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(choisir).not.toHaveBeenCalled();
    expect(screen.getByText('12 / 12 alvéoles, complète')).toBeTruthy();
    expect(container.querySelector('.ivt-alveole--suggested')).toBeNull();
  });

  it('accorde « occupée » au singulier', () => {
    render(<ShelfGrid nom="Étagère 3" capacite={6} occupation={['doux']} onChoisir={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Étagère 3, 1 alvéole occupée sur 6' })).toBeTruthy();
  });
});
