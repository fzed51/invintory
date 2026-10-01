import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field } from './Field.tsx';

afterEach(cleanup);

describe('Field', () => {
  it('relie un libellé toujours visible au champ', () => {
    const { container } = render(<Field libelle="Domaine" />);
    const champ = screen.getByRole('textbox', { name: 'Domaine' });

    expect(container.firstElementChild?.className).toBe('ivt-field');
    expect(champ.className).toBe('ivt-input');
    expect(screen.getByText('Domaine').className).toBe('ivt-field__label');
  });

  it('relie l’aide au champ par aria-describedby', () => {
    render(<Field libelle="Référence" aide="Le code écrit sur l'étiquette de la bouteille." />);
    const champ = screen.getByRole('textbox', { name: 'Référence' });

    expect(champ.getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByText("Le code écrit sur l'étiquette de la bouteille.").className).toBe('ivt-field__hint');
    const ids = champ.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Le code écrit sur l'étiquette de la bouteille.",
    ]);
  });

  it('signale une erreur : bordure, aria-invalid, message relié', () => {
    render(<Field libelle="Nombre de bouteilles" aide="Entre 1 et 12." erreur="Capacité dépassée : 12 alvéoles au maximum." />);
    const champ = screen.getByRole('textbox', { name: 'Nombre de bouteilles' });
    const message = screen.getByText('Capacité dépassée : 12 alvéoles au maximum.');

    expect(champ.className).toBe('ivt-input ivt-input--error');
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    expect(message.className).toBe('ivt-field__error');
    expect(message.querySelector('svg.ivt-icon--sm')).not.toBeNull();
    const ids = champ.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Entre 1 et 12.',
      'Capacité dépassée : 12 alvéoles au maximum.',
    ]);
  });

  it('champ de référence : chasse fixe, sans majuscule automatique ni autocomplétion', () => {
    render(<Field libelle="Référence" reference />);
    const champ = screen.getByRole('textbox', { name: 'Référence' });

    expect(champ.className).toBe('ivt-input ivt-input--reference');
    expect(champ.getAttribute('autocapitalize')).toBe('none');
    expect(champ.getAttribute('autocomplete')).toBe('off');
    expect(champ.getAttribute('spellcheck')).toBe('false');
  });

  it('champ de référence : la saisie est ramenée en minuscules', async () => {
    function Recherche() {
      const [valeur, setValeur] = useState('');
      return <Field libelle="Référence" reference value={valeur} onChange={(e) => setValeur(e.target.value)} />;
    }
    render(<Recherche />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Référence' }), 'K7B');

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('k7b');
  });

  it('transmet les attributs natifs et garde un identifiant fourni', () => {
    render(<Field libelle="Millésime" id="millesime" inputMode="numeric" placeholder="2016" />);
    const champ = screen.getByRole('textbox', { name: 'Millésime' });

    expect(champ.id).toBe('millesime');
    expect(champ.getAttribute('inputmode')).toBe('numeric');
    expect(champ.getAttribute('placeholder')).toBe('2016');
  });

  it('donne des identifiants distincts à deux champs', () => {
    render(
      <>
        <Field libelle="Domaine" aide="Texte libre." />
        <Field libelle="Cépage" aide="Texte libre aussi." />
      </>,
    );

    expect(screen.getByRole('textbox', { name: 'Domaine' }).id).not.toBe(
      screen.getByRole('textbox', { name: 'Cépage' }).id,
    );
  });
});
