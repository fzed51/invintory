import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button.tsx';

afterEach(cleanup);

describe('Button', () => {
  it('est un bouton secondaire de type « button » par défaut', () => {
    render(<Button>Déplacer</Button>);
    const bouton = screen.getByRole('button', { name: 'Déplacer' });

    expect(bouton.getAttribute('type')).toBe('button');
    expect(bouton.className).toBe('ivt-btn ivt-btn--secondary');
  });

  it.each(['primary', 'secondary', 'danger', 'quiet'] as const)('applique la variante %s', (variante) => {
    render(<Button variante={variante}>Ajouter</Button>);

    expect(screen.getByRole('button').classList.contains(`ivt-btn--${variante}`)).toBe(true);
  });

  it('prend toute la largeur en mode bloc', () => {
    render(<Button bloc>Ajouter</Button>);

    expect(screen.getByRole('button').classList.contains('ivt-btn--block')).toBe(true);
  });

  it('accepte le type « submit » et les attributs natifs', () => {
    render(
      <Button type="submit" aria-describedby="aide">
        Enregistrer
      </Button>,
    );
    const bouton = screen.getByRole('button');

    expect(bouton.getAttribute('type')).toBe('submit');
    expect(bouton.getAttribute('aria-describedby')).toBe('aide');
  });

  it('se déclenche à la souris et au clavier', async () => {
    const clic = vi.fn();
    const utilisateur = userEvent.setup();
    render(<Button onClick={clic}>Sortir</Button>);

    await utilisateur.click(screen.getByRole('button'));
    await utilisateur.keyboard('{Enter}');
    await utilisateur.keyboard(' ');

    expect(clic).toHaveBeenCalledTimes(3);
  });

  it('ne se déclenche pas quand il est désactivé', async () => {
    const clic = vi.fn();
    render(
      <Button disabled onClick={clic}>
        Sortir
      </Button>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(clic).not.toHaveBeenCalled();
  });
});
