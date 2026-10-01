import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav.tsx';

afterEach(cleanup);

function liens() {
  return within(screen.getByRole('navigation', { name: 'Navigation principale' })).getAllByRole('link');
}

describe('BottomNav', () => {
  it('présente les cinq entrées dans l’ordre, avec leurs adresses par défaut', () => {
    render(<BottomNav actif="cave" manques={0} />);

    expect(screen.getByRole('navigation').className).toBe('ivt-nav');
    expect(liens().map((l) => [l.getAttribute('href'), l.className])).toEqual([
      ['/', 'ivt-nav__item'],
      ['/repas', 'ivt-nav__item'],
      ['/ajouter', 'ivt-nav__item'],
      ['/manques', 'ivt-nav__item'],
      ['/reglages', 'ivt-nav__item'],
    ]);
    expect(screen.getByRole('link', { name: 'Cave' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Repas' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manques' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Réglages' })).toBeTruthy();
  });

  it('chaque entrée porte une icône décorative', () => {
    render(<BottomNav actif="cave" manques={0} />);

    for (const lien of liens()) {
      expect(lien.querySelector('svg.ivt-icon')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it.each(['cave', 'repas', 'ajouter', 'manques', 'reglages'] as const)('marque l’onglet actif « %s »', (actif) => {
    render(<BottomNav actif={actif} manques={0} />);
    const courants = liens().filter((l) => l.getAttribute('aria-current') === 'page');

    expect(courants).toHaveLength(1);
    expect(courants[0].getAttribute('href')).toBe(actif === 'cave' ? '/' : `/${actif}`);
  });

  it('Ajouter : rond de marque sans libellé visible, nommé par aria-label', () => {
    render(<BottomNav actif="cave" manques={0} />);
    const ajouter = screen.getByRole('link', { name: 'Ajouter une bouteille' });

    expect(ajouter.querySelector('.ivt-nav__add')).not.toBeNull();
    expect(ajouter.textContent).toBe('');
  });

  it('affiche la pastille de manques avec un libellé accessible', () => {
    render(<BottomNav actif="cave" manques={3} />);
    const pastille = screen.getByLabelText('3 catégories en manque');

    expect(pastille.className).toBe('ivt-pastille ivt-nav__pastille');
    expect(screen.getByRole('link', { name: /^Manques/ }).contains(pastille)).toBe(true);
  });

  it('accorde le libellé de la pastille au singulier', () => {
    render(<BottomNav actif="cave" manques={1} />);

    expect(screen.getByLabelText('1 catégorie en manque')).toBeTruthy();
  });

  it('masque la pastille sans manque', () => {
    const { container } = render(<BottomNav actif="cave" manques={0} />);

    expect(container.querySelector('.ivt-pastille')).toBeNull();
  });

  it('accepte des adresses personnalisées', () => {
    render(<BottomNav actif="cave" manques={0} liens={{ cave: '/cave', reglages: '/compte' }} />);

    expect(screen.getByRole('link', { name: 'Cave' }).getAttribute('href')).toBe('/cave');
    expect(screen.getByRole('link', { name: 'Réglages' }).getAttribute('href')).toBe('/compte');
    expect(screen.getByRole('link', { name: 'Repas' }).getAttribute('href')).toBe('/repas');
  });

  it('se parcourt au clavier dans l’ordre', async () => {
    const utilisateur = userEvent.setup();
    render(<BottomNav actif="cave" manques={0} />);
    const visites: string[] = [];

    for (let i = 0; i < 5; i += 1) {
      await utilisateur.tab();
      visites.push(document.activeElement?.getAttribute('href') ?? '');
    }

    expect(visites).toEqual(['/', '/repas', '/ajouter', '/manques', '/reglages']);
  });
});
