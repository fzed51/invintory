import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Banner } from './Banner.tsx';

afterEach(cleanup);

describe('Banner', () => {
  it('neutre par défaut : statut, icône et titre', () => {
    render(<Banner titre="Hors ligne">3 mouvements en attente de synchronisation.</Banner>);
    const banniere = screen.getByRole('status');

    expect(banniere.className).toBe('ivt-banner');
    expect(banniere.querySelector('svg.ivt-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Hors ligne').className).toBe('ivt-banner__title');
    expect(banniere.textContent).toBe('Hors ligne3 mouvements en attente de synchronisation.');
  });

  it.each([
    ['success', 'status'],
    ['warning', 'status'],
    ['danger', 'alert'],
  ] as const)('variante %s : classe et rôle %s', (variante, role) => {
    render(<Banner variante={variante} titre="Titre" />);

    expect(screen.getByRole(role).className).toBe(`ivt-banner ivt-banner--${variante}`);
  });

  it('chaque variante a sa propre icône par défaut', () => {
    const { container } = render(
      <>
        <Banner titre="a" />
        <Banner variante="success" titre="b" />
        <Banner variante="warning" titre="c" />
        <Banner variante="danger" titre="d" />
      </>,
    );
    const dessins = [...container.querySelectorAll('svg')].map((svg) => svg.innerHTML);

    expect(new Set(dessins).size).toBe(4);
  });

  it('accepte une icône choisie', () => {
    const { container } = render(<Banner titre="Hors ligne" icone="hors-ligne" />);
    const { container: reference } = render(<Banner titre="x" icone="hors-ligne" />);

    expect(container.querySelector('svg')?.innerHTML).toBe(reference.querySelector('svg')?.innerHTML);
  });

  it('affiche des actions sous le message', () => {
    render(
      <Banner titre="Nouvelle version disponible" actions={<button type="button">Actualiser</button>}>
        Actualiser pour utiliser la dernière version.
      </Banner>,
    );

    expect(screen.getByRole('button', { name: 'Actualiser' })).toBeTruthy();
  });
});
