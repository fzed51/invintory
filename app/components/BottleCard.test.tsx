import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BottleCard, type BottleCardProps } from './BottleCard.tsx';

afterEach(cleanup);

const bouteille: BottleCardProps = {
  href: '/bouteilles/k7',
  domaine: 'Domaine Delaunay',
  region: 'Pommard',
  cepage: 'Pinot noir',
  millesime: 2016,
  type: 'rouge',
  emplacement: 'Armoire de la cuisine › Étagère 2',
  reference: 'k7',
};

describe('BottleCard', () => {
  it('est un lien vers la fiche, titré par le domaine', () => {
    render(<BottleCard {...bouteille} />);
    const lien = screen.getByRole('link');

    expect(lien.getAttribute('href')).toBe('/bouteilles/k7');
    expect(lien.className).toBe('ivt-bottle');
    expect(screen.getByRole('heading', { level: 3, name: 'Domaine Delaunay' })).toBeTruthy();
  });

  it('affiche appellation · cépage · millésime, l’emplacement et la référence', () => {
    render(<BottleCard {...bouteille} />);

    expect(screen.getByText('Pommard · Pinot noir · 2016')).toBeTruthy();
    expect(screen.getByText('Armoire de la cuisine › Étagère 2')).toBeTruthy();
    expect(screen.getByText('k7').className).toBe('ivt-ref');
  });

  it('écrit « non millésimé » sans année, jamais un tiret', () => {
    render(<BottleCard {...bouteille} millesime={null} />);

    expect(screen.getByText('Pommard · Pinot noir · non millésimé')).toBeTruthy();
  });

  it('omet l’appellation et le cépage absents', () => {
    render(<BottleCard {...bouteille} region={null} cepage={null} />);

    expect(screen.getByText('2016')).toBeTruthy();
  });

  it('affiche la référence en minuscules', () => {
    render(<BottleCard {...bouteille} reference="K7" />);

    expect(screen.getByText('k7')).toBeTruthy();
  });

  it('n’affiche pas de puce sans référence attribuée', () => {
    const { container } = render(<BottleCard {...bouteille} reference={null} />);

    expect(container.querySelector('.ivt-ref')).toBeNull();
  });

  it('remplace un domaine absent par un libellé explicite', () => {
    render(<BottleCard {...bouteille} domaine={null} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Domaine non renseigné' })).toBeTruthy();
  });

  it('affiche le badge de type, et les badges souvenir et urgent quand ils s’appliquent', () => {
    const { container, rerender } = render(<BottleCard {...bouteille} />);

    expect(container.querySelector('.ivt-badge--rouge')).not.toBeNull();
    expect(container.querySelector('.ivt-badge--souvenir')).toBeNull();
    expect(container.querySelector('.ivt-badge--urgent')).toBeNull();

    rerender(<BottleCard {...bouteille} souvenir urgent />);

    expect(screen.getByText('Souvenir')).toBeTruthy();
    expect(screen.getByText("À boire d'urgence")).toBeTruthy();
  });

  it('marque la sélection', () => {
    render(<BottleCard {...bouteille} selectionnee />);

    expect(screen.getByRole('link').className).toBe('ivt-bottle ivt-bottle--selected');
  });
});
