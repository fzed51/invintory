import { useId, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { cx } from '../design/wine-types.ts';
import { Icone } from './Icone.tsx';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  /** Libellé toujours visible. */
  libelle: string;
  aide?: string;
  /** Message d'erreur : dit l'état, puis quoi faire. */
  erreur?: string;
  /** Champ de recherche par référence : chasse fixe, saisie ramenée en minuscules. */
  reference?: boolean;
};

/** Champ de saisie avec libellé, aide et erreur reliés au champ. */
export function Field({ libelle, aide, erreur, reference = false, id, className, onChange, ...attributs }: Props) {
  const idAuto = useId();
  const idChamp = id ?? idAuto;
  const idAide = `${idChamp}-aide`;
  const idErreur = `${idChamp}-erreur`;
  const decrit = [aide && idAide, erreur && idErreur].filter(Boolean).join(' ');

  const changer = (evenement: ChangeEvent<HTMLInputElement>) => {
    if (reference) evenement.target.value = evenement.target.value.toLowerCase();
    onChange?.(evenement);
  };

  return (
    <div className="ivt-field">
      <label className="ivt-field__label" htmlFor={idChamp}>
        {libelle}
      </label>
      <input
        id={idChamp}
        className={cx('ivt-input', reference && 'ivt-input--reference', erreur && 'ivt-input--error', className)}
        aria-describedby={decrit || undefined}
        aria-invalid={erreur ? true : undefined}
        {...(reference && { autoCapitalize: 'none', autoComplete: 'off', spellCheck: false })}
        onChange={changer}
        {...attributs}
      />
      {aide && (
        <p className="ivt-field__hint" id={idAide}>
          {aide}
        </p>
      )}
      {erreur && (
        <p className="ivt-field__error" id={idErreur}>
          <Icone nom="erreur" taille="sm" />
          {erreur}
        </p>
      )}
    </div>
  );
}
