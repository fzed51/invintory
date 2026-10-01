import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet.tsx';

afterEach(cleanup);

function dialogue() {
  return document.querySelector('dialog') as HTMLDialogElement;
}

describe('Sheet', () => {
  it('ouverte : dialogue modal nommé par son titre', () => {
    render(
      <Sheet titre="Sortir la bouteille" ouvert onFermer={vi.fn()}>
        Choisir un motif.
      </Sheet>,
    );
    const feuille = screen.getByRole('dialog', { name: 'Sortir la bouteille' });

    expect(feuille.tagName).toBe('DIALOG');
    expect(feuille.className).toBe('ivt-sheet');
    expect(dialogue().open).toBe(true);
    expect(screen.getByRole('heading', { level: 2, name: 'Sortir la bouteille' }).className).toBe('title-2');
    expect(screen.getByText('Choisir un motif.')).toBeTruthy();
  });

  it('fermée : rien n’est exposé', () => {
    render(
      <Sheet titre="Sortir la bouteille" ouvert={false} onFermer={vi.fn()}>
        Choisir un motif.
      </Sheet>,
    );

    expect(dialogue().open).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('suit la propriété « ouvert » : ouverture modale puis fermeture', () => {
    const ouvrir = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const fermer = vi.spyOn(HTMLDialogElement.prototype, 'close');
    const { rerender } = render(<Sheet titre="Déplacer" ouvert={false} onFermer={vi.fn()} />);

    rerender(<Sheet titre="Déplacer" ouvert onFermer={vi.fn()} />);
    expect(ouvrir).toHaveBeenCalledTimes(1);

    rerender(<Sheet titre="Déplacer" ouvert={false} onFermer={vi.fn()} />);
    expect(fermer).toHaveBeenCalledTimes(1);
    expect(dialogue().open).toBe(false);

    ouvrir.mockRestore();
    fermer.mockRestore();
  });

  it('Échap demande la fermeture au parent, sans fermer de force', () => {
    const onFermer = vi.fn();
    render(<Sheet titre="Déplacer" ouvert onFermer={onFermer} />);

    const annulation = new Event('cancel', { cancelable: true });
    dialogue().dispatchEvent(annulation);

    expect(onFermer).toHaveBeenCalledTimes(1);
    expect(annulation.defaultPrevented).toBe(true);
    expect(dialogue().open).toBe(true);
  });
});
