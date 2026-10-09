import { vi } from 'vitest';

/** Réponse simulée : fonction appelée à chaque requête correspondante, ou réponse fixe. */
type Reponse = Response | Error | ((requete: Request) => Response | Error | Promise<Response | Error>);

/**
 * Remplace fetch par une table « MÉTHODE /chemin » → réponse. Une route absente lève une
 * erreur explicite ; chaque requête reçue est consignée dans `requetes`.
 */
export function simulerServeur(routes: Record<string, Reponse>) {
  const requetes: Request[] = [];
  const fetchMock = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    // Le Request de jsdom ne lit pas le Blob de Node (setup.ts) : corps passé en octets.
    const corps = init?.body instanceof Blob ? await init.body.arrayBuffer() : init?.body;
    const requete = new Request(new URL(String(entree), 'http://localhost'), { ...init, body: corps });
    requetes.push(requete);
    const cle = `${requete.method} ${new URL(requete.url).pathname}`;
    const route = routes[cle];
    if (route === undefined) throw new Error(`Route non simulée : ${cle}`);
    const reponse =
      typeof route === 'function' ? await route(requete) : route instanceof Error ? route : route.clone();
    if (reponse instanceof Error) throw reponse;
    return reponse;
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    requetes,
    /** Requêtes reçues sur une route, au format « MÉTHODE /chemin ». */
    appels: (cle: string) => requetes.filter((r) => `${r.method} ${new URL(r.url).pathname}` === cle),
  };
}

export function erreur(statut: number, code: string, message = 'Message.', entetes: HeadersInit = {}): Response {
  return Response.json({ error: { code, message } }, { status: statut, headers: entetes });
}

export function jeton(valeur: string): Response {
  return Response.json({ access_token: valeur, expires_in: 900 });
}

/** Jeton d'accès au format JWT (signature factice) portant le compte `sub`. */
export function jwt(sub: string): string {
  const charge = btoa(JSON.stringify({ sub })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `eyJhbGciOiJSUzI1NiJ9.${charge}.signature`;
}

export const reseauCoupe = () => new TypeError('Failed to fetch');
