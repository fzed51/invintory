import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl.tsx';

afterEach(cleanup);

type Tri = 'priorite' | 'age' | 'nom';

const options = [
  { valeur: 'priorite', libelle: 'À boire en priorité' },
  { valeur: 'age', libelle: 'Par âge' },
  { valeur: 'nom', libelle: 'Par nom' },
] as const;

function Tris({ initial = 'priorite' as Tri, onChange = vi.fn<(valeur: Tri) => void>() }) {
  const [valeur, setValeur] = useState<Tri>(initial);
  return (
    <SegmentedControl
      libelle="Trier par"
      options={options}
      valeur={valeur}
      onChange={(v) => {
        setValeur(v);
        onChange(v);
      }}
    />
  );
}

function coche(nom: string) {
  return screen.getByRole('radio', { name: nom }).getAttribute('aria-checked');
}

describe('SegmentedControl', () => {
  it('est un groupe radio nommé dont seule l’option active est cochée', () => {
    render(<Tris />);
    const groupe = screen.getByRole('radiogroup', { name: 'Trier par' });

    expect(groupe.className).toBe('ivt-seg');
    expect(screen.getAllByRole('radio').map((r) => r.className)).toEqual([
      'ivt-seg__opt',
      'ivt-seg__opt',
      'ivt-seg__opt',
    ]);
    expect(coche('À boire en priorité')).toBe('true');
    expect(coche('Par âge')).toBe('false');
  });

  it('change d’option au clic', async () => {
    const changer = vi.fn();
    render(<Tris onChange={changer} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Par âge' }));

    expect(changer).toHaveBeenCalledWith('age');
    expect(coche('Par âge')).toBe('true');
    expect(coche('À boire en priorité')).toBe('false');
  });

  it('n’offre qu’un arrêt de tabulation : l’option cochée', async () => {
    render(<Tris initial="age" />);

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Par âge' }));
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('se pilote aux flèches, en boucle, et avec Début et Fin', async () => {
    const utilisateur = userEvent.setup();
    render(<Tris />);
    await utilisateur.tab();

    await utilisateur.keyboard('{ArrowRight}');
    expect(coche('Par âge')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Par âge' }));

    await utilisateur.keyboard('{ArrowDown}{ArrowDown}');
    expect(coche('À boire en priorité')).toBe('true');

    await utilisateur.keyboard('{ArrowLeft}');
    expect(coche('Par nom')).toBe('true');

    await utilisateur.keyboard('{ArrowUp}');
    expect(coche('Par âge')).toBe('true');

    await utilisateur.keyboard('{Home}');
    expect(coche('À boire en priorité')).toBe('true');

    await utilisateur.keyboard('{End}');
    expect(coche('Par nom')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Par nom' }));
  });
});
