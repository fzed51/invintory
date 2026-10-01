import { Pastille } from './Badge.tsx';
import { Icone, type NomIcone } from './Icone.tsx';

export type Onglet = 'cave' | 'repas' | 'ajouter' | 'manques' | 'reglages';

const ENTREES: ReadonlyArray<{ onglet: Onglet; libelle: string; icone: NomIcone }> = [
  { onglet: 'cave', libelle: 'Cave', icone: 'cave' },
  { onglet: 'repas', libelle: 'Repas', icone: 'recherche' },
  { onglet: 'ajouter', libelle: 'Ajouter une bouteille', icone: 'ajouter' },
  { onglet: 'manques', libelle: 'Manques', icone: 'alerte' },
  { onglet: 'reglages', libelle: 'Réglages', icone: 'reglages' },
];

const LIENS: Record<Onglet, string> = {
  cave: '/',
  repas: '/repas',
  ajouter: '/ajouter',
  manques: '/manques',
  reglages: '/reglages',
};

type Props = {
  actif: Onglet;
  /** Nombre de catégories en manque (pastille de l'onglet Manques). */
  manques: number;
  /** Adresses à substituer aux adresses par défaut. */
  liens?: Partial<Record<Onglet, string>>;
};

/** Barre de navigation principale à cinq entrées. */
export function BottomNav({ actif, manques, liens = {} }: Props) {
  return (
    <nav className="ivt-nav" aria-label="Navigation principale">
      {ENTREES.map(({ onglet, libelle, icone }) => {
        const commun = {
          className: 'ivt-nav__item',
          href: liens[onglet] ?? LIENS[onglet],
          'aria-current': onglet === actif ? ('page' as const) : undefined,
        };

        if (onglet === 'ajouter') {
          return (
            <a key={onglet} {...commun} aria-label={libelle}>
              <span className="ivt-nav__add">
                <Icone nom={icone} />
              </span>
            </a>
          );
        }

        return (
          <a key={onglet} {...commun}>
            <Icone nom={icone} />
            {libelle}
            {onglet === 'manques' && (
              <Pastille
                nombre={manques}
                libelle={`${manques} ${manques > 1 ? 'catégories' : 'catégorie'} en manque`}
                className="ivt-nav__pastille"
              />
            )}
          </a>
        );
      })}
    </nav>
  );
}
