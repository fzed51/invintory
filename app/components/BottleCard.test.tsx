import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { BottleCard, type BottleCardProps } from './BottleCard.tsx';

/** Lien du routeur : la carte se rend dans un routeur. */
const rendre = (carte: ReactElement) => render(<MemoryRouter>{carte}</MemoryRouter>);

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
  it('lien du routeur : ouvre la fiche sans recharger la page', async () => {
    const utilisateur = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<BottleCard {...bouteille} />} />
          <Route path="/bouteilles/k7" element={<h1>Fiche k7</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await utilisateur.click(screen.getByRole('link'));

    expect(screen.getByRole('heading', { level: 1, name: 'Fiche k7' })).toBeTruthy();
  });

  it('est un lien vers la fiche, titré par le domaine', () => {
    rendre(<BottleCard {...bouteille} />);
    const lien = screen.getByRole('link');

    expect(lien.getAttribute('href')).toBe('/bouteilles/k7');
    expect(lien.className).toBe('ivt-bottle');
    expect(screen.getByRole('heading', { level: 3, name: 'Domaine Delaunay' })).toBeTruthy();
  });

  it('affiche appellation · cépage · millésime, l’emplacement et la référence', () => {
    rendre(<BottleCard {...bouteille} />);

    expect(screen.getByText('Pommard · Pinot noir · 2016')).toBeTruthy();
    expect(screen.getByText('Armoire de la cuisine › Étagère 2')).toBeTruthy();
    expect(screen.getByText('k7').className).toBe('ivt-ref');
  });

  it('écrit « non millésimé » sans année, jamais un tiret', () => {
    rendre(<BottleCard {...bouteille} millesime={null} />);

    expect(screen.getByText('Pommard · Pinot noir · non millésimé')).toBeTruthy();
  });

  it('omet l’appellation et le cépage absents', () => {
    rendre(<BottleCard {...bouteille} region={null} cepage={null} />);

    expect(screen.getByText('2016')).toBeTruthy();
  });

  it('affiche la référence en minuscules', () => {
    rendre(<BottleCard {...bouteille} reference="K7" />);

    expect(screen.getByText('k7')).toBeTruthy();
  });

  it('n’affiche pas de puce sans référence attribuée', () => {
    const { container } = rendre(<BottleCard {...bouteille} reference={null} />);

    expect(container.querySelector('.ivt-ref')).toBeNull();
  });

  it('remplace un domaine absent par un libellé explicite', () => {
    rendre(<BottleCard {...bouteille} domaine={null} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Domaine non renseigné' })).toBeTruthy();
  });

  it('affiche le badge de type, et les badges souvenir et urgent quand ils s’appliquent', () => {
    const { container, rerender } = rendre(<BottleCard {...bouteille} />);

    expect(container.querySelector('.ivt-badge--rouge')).not.toBeNull();
    expect(container.querySelector('.ivt-badge--souvenir')).toBeNull();
    expect(container.querySelector('.ivt-badge--urgent')).toBeNull();

    rerender(
      <MemoryRouter>
        <BottleCard {...bouteille} souvenir urgent />
      </MemoryRouter>,
    );

    expect(screen.getByText('Souvenir')).toBeTruthy();
    expect(screen.getByText("À boire d'urgence")).toBeTruthy();
  });

  it('marque la sélection', () => {
    rendre(<BottleCard {...bouteille} selectionnee />);

    expect(screen.getByRole('link').className).toBe('ivt-bottle ivt-bottle--selected');
  });
});
