/** Mutation telle que reçue par `POST /api/sync` (contrat §10.1), lue sans validation. */
type MutationRecue = {
  client_ref: string;
  schema_version: number;
  kind: string;
  bottle?: string;
  bottles?: { client_ref: string; reference?: string }[];
  location?: unknown;
};

type Resultat = Record<string, unknown> & { client_ref: string; status: string };

/**
 * `POST /api/sync` simulé, idempotent comme le serveur (contrat §10.2) : une mutation déjà
 * reçue n'est pas réappliquée, sa réponse est rejouée en `already_applied` ; un mouvement sur
 * une bouteille inconnue est rejeté (`BOTTLE_NOT_FOUND`).
 */
export function serveurSync() {
  const appliquees = new Map<string, Resultat>();
  const bouteilles = new Set<string>();
  let dernierId = 0;

  function traiter(m: MutationRecue): Resultat {
    const deja = appliquees.get(m.client_ref);
    if (deja !== undefined) return { ...deja, status: 'already_applied' };

    let resultat: Resultat;
    if (m.kind === 'add') {
      resultat = {
        client_ref: m.client_ref,
        status: 'applied',
        bottles: (m.bottles ?? []).map((b) => {
          bouteilles.add(b.client_ref);
          dernierId++;
          return { client_ref: b.client_ref, id: dernierId, reference: b.reference ?? `g${dernierId}`, location: m.location, redirected: null };
        }),
      };
    } else if (m.bottle === undefined || !bouteilles.has(m.bottle)) {
      return { client_ref: m.client_ref, status: 'rejected', error: { code: 'BOTTLE_NOT_FOUND', message: 'Bouteille inconnue.' } };
    } else {
      resultat = { client_ref: m.client_ref, status: 'applied', movement_id: ++dernierId, redirected: null };
    }
    appliquees.set(m.client_ref, resultat);
    return resultat;
  }

  return {
    /** client_ref des mutations appliquées, dans l'ordre d'application. */
    appliquees,
    /** Traite le lot sans répondre (réponse perdue en route). */
    traiterLot: async (requete: Request) => ((await requete.clone().json()) as { mutations: MutationRecue[] }).mutations.map(traiter),
    route: async (requete: Request) =>
      Response.json({ results: ((await requete.clone().json()) as { mutations: MutationRecue[] }).mutations.map(traiter) }),
  };
}
