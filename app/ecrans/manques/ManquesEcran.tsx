import { nomCategorie, phraseManque, type Manque, type Suggestion } from '../../categories/categories.ts';
import { useManquesDeLaCoque } from '../../categories/lecture.ts';
import { CHEMINS } from '../../chemins.ts';
import { Banner } from '../../components/Banner.tsx';
import { messageErreur } from '../../session/clientApi.ts';
import { LienBouton, Section } from '../cave/communs.tsx';

const LISTE = { listStyle: 'none', margin: 0, padding: 0 } as const;
const JOUR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Vin déjà eu dans la catégorie, à la manière d'une carte bouteille (sans fiche à ouvrir). */
function CarteSuggestion({ suggestion }: { suggestion: Suggestion }) {
  const { domain, vintage, region, grape, last_movement_at } = suggestion;
  const meta = [region, grape, vintage === null ? 'non millésimé' : String(vintage)]
    .filter((partie) => partie !== null && partie !== '')
    .join(' · ');
  return (
    <div className="ivt-bottle">
      <div>
        <h3 className="ivt-bottle__title">{domain ?? 'Domaine non renseigné'}</h3>
        <p className="ivt-bottle__meta">{meta}</p>
        {last_movement_at !== null && (
          <p className="ivt-bottle__where">Dernier mouvement le {JOUR.format(new Date(last_movement_at))}</p>
        )}
      </div>
    </div>
  );
}

function ManqueCategorie({ manque }: { manque: Manque }) {
  const nom = nomCategorie(manque.category);
  return (
    <Section titre={nom} niveau={2}>
      <Banner variante="warning" titre={`${nom} sous son seuil`}>
        {phraseManque(manque.missing, manque.threshold)}
      </Banner>
      {manque.suggestions.length === 0 ? (
        <p>Aucun vin de cette catégorie dans l’historique.</p>
      ) : (
        <>
          <p className="caption" style={{ margin: 0 }}>
            Déjà eus dans cette catégorie, du plus récent au plus ancien
          </p>
          <ul className="ivt-stack" style={LISTE}>
            {manque.suggestions.map((suggestion, index) => (
              <li key={index}>
                <CarteSuggestion suggestion={suggestion} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

/**
 * Catégories sous leur seuil (CdC §3.7) : quantité manquante et vins déjà eus. Lecture de la
 * coque (celle de la pastille), copie locale hors ligne.
 */
export function ManquesEcran() {
  const lecture = useManquesDeLaCoque();

  return (
    <>
      <h1 className="title-1">Manques</h1>
      {lecture.etat === 'chargement' && <Banner titre="Chargement des manques" />}
      {lecture.etat === 'erreur' && (
        <Banner variante="danger" titre="Manques indisponibles">
          {messageErreur(lecture.erreur)}
        </Banner>
      )}
      {lecture.etat === 'pret' &&
        (lecture.donnees.length === 0 ? (
          <p>Aucune catégorie sous son seuil.</p>
        ) : (
          lecture.donnees.map((manque) => <ManqueCategorie key={manque.category.id} manque={manque} />)
        ))}
      <div className="ivt-row" style={{ padding: 0 }}>
        <LienBouton vers={CHEMINS.categories}>Gérer les catégories</LienBouton>
      </div>
    </>
  );
}
