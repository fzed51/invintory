import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WineType } from '../design/wine-types.ts';
import { ShelfGrid } from './ShelfGrid.tsx';

afterEach(cleanup);

const neuf: WineType[] = ['rouge', 'rouge', 'blanc', 'rouge', 'rose', 'blanc', 'effervescent', 'doux', 'autre'];

function alveoles() {
  return screen.getAllByRole('button');
}

describe('ShelfGrid', () => {
  it('nomme la section, affiche le titre et le compteur', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} />);

    const section = screen.getByRole('region', { name: 'Étagère 2' });
    expect(section.className).toBe('ivt-shelf');
    expect(within(section).getByRole('heading', { level: 3, name: 'Étagère 2' })).toBeTruthy();
    expect(screen.getByText('9 / 12 alvéoles')).toBeTruthy();
  });

  it('dessine une alvéole par place : occupées colorées par type, puis libres', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} />);
    const liste = alveoles();

    expect(liste).toHaveLength(12);
    expect(liste[0].getAttribute('data-wine')).toBe('rouge');
    expect(liste[0].getAttribute('aria-label')).toBe('Alvéole 1 : Rouge');
    expect(liste[6].getAttribute('aria-label')).toBe('Alvéole 7 : Effervescent');
    expect(liste[9].hasAttribute('data-wine')).toBe(false);
    expect(liste[9].getAttribute('aria-label')).toBe('Alvéole 10 : libre');
    expect(liste.every((a) => a.classList.contains('ivt-alveole'))).toBe(true);
  });

  it('propose la première alvéole libre', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} proposee />);
    const liste = alveoles();

    expect(liste[9].className).toBe('ivt-alveole ivt-alveole--suggested');
    expect(liste[9].getAttribute('aria-label')).toBe('Alvéole 10 : emplacement proposé');
    expect(liste[10].className).toBe('ivt-alveole');
  });

  it('choisit l’étagère par une alvéole libre, à la souris et au clavier', async () => {
    const choisir = vi.fn();
    const utilisateur = userEvent.setup();
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} onChoisir={choisir} />);

    await utilisateur.click(alveoles()[10]);
    alveoles()[11].focus();
    await utilisateur.keyboard('{Enter}');

    expect(choisir.mock.calls).toEqual([[10], [11]]);
  });

  it('ouvre une alvéole occupée quand c’est prévu', async () => {
    const ouvrir = vi.fn();
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} onOuvrir={ouvrir} />);

    await userEvent.click(alveoles()[2]);

    expect(ouvrir).toHaveBeenCalledWith(2);
  });

  it('désactive les alvéoles sans action associée', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} />);

    expect(alveoles().every((a) => (a as HTMLButtonElement).disabled)).toBe(true);
  });

  it('étagère pleine : aucune alvéole libre à choisir ni à proposer', () => {
    const pleine: WineType[] = Array.from({ length: 12 }, () => 'rouge');
    render(<ShelfGrid nom="Étagère 1" capacite={12} occupation={pleine} proposee onChoisir={vi.fn()} />);

    expect(screen.getByText('12 / 12 alvéoles')).toBeTruthy();
    expect(alveoles().filter((a) => !a.hasAttribute('data-wine'))).toHaveLength(0);
    expect(document.querySelector('.ivt-alveole--suggested')).toBeNull();
  });

  it('occupation au-delà de la capacité : toutes les bouteilles restent visibles', () => {
    const treize: WineType[] = Array.from({ length: 13 }, () => 'blanc');
    render(<ShelfGrid nom="Étagère 1" capacite={12} occupation={treize} />);

    expect(alveoles()).toHaveLength(13);
    expect(screen.getByText('13 / 12 alvéoles')).toBeTruthy();
  });

  it('marque l’alvéole sélectionnée', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} selectionnee={10} onChoisir={vi.fn()} />);
    const choisie = alveoles()[10];

    expect(choisie.className).toBe('ivt-alveole ivt-alveole--selected');
    expect(choisie.getAttribute('aria-pressed')).toBe('true');
    expect(alveoles()[11].getAttribute('aria-pressed')).toBe('false');
  });

  it('affiche la légende Libre, Occupée, Proposée', () => {
    render(<ShelfGrid nom="Étagère 2" capacite={12} occupation={neuf} />);
    const legende = screen.getByRole('list');

    expect(legende.className).toBe('ivt-legend');
    expect(within(legende).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Libre',
      'Occupée',
      'Proposée',
    ]);
  });
});
