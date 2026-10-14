import type { WineType } from '../design/wine-types.ts';
import type { BaseHorsLigne } from '../hors-ligne/base.ts';
import type { HorsLigne } from '../hors-ligne/contexte.ts';
import { VERSION_MUTATIONS, type Emplacement, type Mutation } from '../hors-ligne/mutations.ts';
import { prendreReferences } from '../hors-ligne/reserve.ts';

/** Saisie du formulaire d'ajout (CdC §3.3), telle que tapée : textes bruts, photo réduite. */
export type SaisieAjout = {
  type: WineType;
  domaine: string;
  region: string;
  cepage: string;
  millesime: string;
  /** `AAAA-MM`. */
  dateEntree: string;
  origine: 'achetee' | 'offerte';
  souvenir: boolean;
  note: string;
  /** Nombre de bouteilles identiques (ajout en masse). */
  quantite: string;
  photo: Blob | null;
};

/** Brouillon du formulaire d'ajout ; `version` : forme de la saisie gardée. */
const BROUILLON = { cle: 'ajout', version: 1 } as const;

/** Formulaire vide : une bouteille, entrée le mois courant de l'appareil (CdC §2.2). */
export function saisieInitiale(maintenant = new Date()): SaisieAjout {
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0');
  return {
    type: 'rouge',
    domaine: '',
    region: '',
    cepage: '',
    millesime: '',
    dateEntree: `${maintenant.getFullYear()}-${mois}`,
    origine: 'achetee',
    souvenir: false,
    note: '',
    quantite: '1',
    photo: null,
  };
}

/** Saisie interrompue (rechargement, mise à jour de la PWA) ; null s'il n'y en a pas. */
export async function lireBrouillon(base: BaseHorsLigne): Promise<SaisieAjout | null> {
  const brouillon = await base.brouillons.get(BROUILLON.cle);
  const { version, ...saisie } = (brouillon?.saisie ?? {}) as { version?: unknown } & SaisieAjout;
  return version === BROUILLON.version ? saisie : null;
}

/** Enregistre la saisie en cours (P4 : à chaque modification). */
export async function ecrireBrouillon(base: BaseHorsLigne, saisie: SaisieAjout): Promise<void> {
  await base.brouillons.put({ cle: BROUILLON.cle, saisie: { version: BROUILLON.version, ...saisie } });
}

/** Abandon explicite de la saisie. */
export async function effacerBrouillon(base: BaseHorsLigne): Promise<void> {
  await base.brouillons.delete(BROUILLON.cle);
}

const ouNull = (valeur: string) => (valeur.trim() === '' ? null : valeur.trim());

/** Ajout mis en file : son `client_ref` (celui du lot) et les codes à recopier sur les étiquettes. */
export type AjoutEnregistre = { client_ref: string; references: (string | null)[] };

/**
 * Met en file l'ajout de N bouteilles identiques (contrat §10.1) : chacune reçoit son
 * `client_ref` et un code de la réserve (P1), la photo commune est gardée sous le
 * `client_ref` du lot (le serveur la copie par bouteille, Arch §5.3) et le brouillon est
 * effacé, le tout d'un bloc. Puis l'envoi part et la réserve est complétée.
 * La saisie est supposée vérifiée.
 */
export async function enregistrerAjout(
  { base, synchro }: HorsLigne,
  saisie: SaisieAjout,
  location: Emplacement,
  maintenant = new Date(),
): Promise<AjoutEnregistre> {
  const client_ref = crypto.randomUUID();
  const references = await base.transaction('rw', [base.file, base.photos, base.reserve, base.brouillons], async () => {
    const codes = await prendreReferences(base, Number(saisie.quantite));
    const mutation: Mutation = {
      kind: 'add',
      occurred_at: maintenant.toISOString(),
      bottles: codes.map((reference) => ({ client_ref: crypto.randomUUID(), ...(reference !== null && { reference }) })),
      fields: {
        type: saisie.type,
        region: ouNull(saisie.region),
        grape: ouNull(saisie.cepage),
        domain: ouNull(saisie.domaine),
        vintage: saisie.millesime === '' ? null : Number(saisie.millesime),
        entry_date: saisie.dateEntree,
        origin: saisie.origine,
        note: ouNull(saisie.note),
        souvenir: saisie.souvenir,
      },
      location,
    };
    await base.file.add({ client_ref, schemaVersion: VERSION_MUTATIONS, mutation });
    if (saisie.photo !== null) await base.photos.put({ client_ref, blob: saisie.photo });
    await base.brouillons.delete(BROUILLON.cle);
    return codes;
  });
  synchro.relancer();
  synchro.reserver().catch(() => undefined);
  return { client_ref, references };
}
