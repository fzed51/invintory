import { afterEach, describe, expect, it, vi } from 'vitest';
import { erreur, jeton, jwt, reseauCoupe, simulerServeur } from '../test/serveur.ts';
import { ClientApi, ErreurApi, ErreurReseau } from './clientApi.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const REFRESH = 'POST /api/auth/refresh';

describe('ClientApi', () => {
  it('sans jeton, rafraîchit la session puis envoie la requête avec le Bearer', async () => {
    const serveur = simulerServeur({
      [REFRESH]: jeton('j1'),
      'GET /api/account': Response.json({ email: 'a@exemple.fr' }),
    });
    const client = new ClientApi();

    expect(await client.requete('/api/account')).toEqual({ email: 'a@exemple.fr' });

    expect(serveur.requetes.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([REFRESH, 'GET /api/account']);
    expect(serveur.appels('GET /api/account')[0].headers.get('Authorization')).toBe('Bearer j1');
  });

  it('requêtes simultanées sans jeton : un seul rafraîchissement', async () => {
    const serveur = simulerServeur({
      [REFRESH]: async () => {
        await new Promise((fin) => setTimeout(fin, 10));
        return jeton('j1');
      },
      'GET /api/account': Response.json({}),
      'GET /api/cellar': Response.json({}),
    });
    const client = new ClientApi();

    await Promise.all([client.requete('/api/account'), client.requete('/api/cellar'), client.requete('/api/account')]);

    expect(serveur.appels(REFRESH)).toHaveLength(1);
  });

  it('jeton expiré (401) : rafraîchit puis rejoue la requête une fois', async () => {
    let jetonsVus = 0;
    const serveur = simulerServeur({
      'POST /api/auth/login': jeton('ancien'),
      [REFRESH]: jeton('nouveau'),
      'GET /api/cellar': (requete) =>
        ++jetonsVus && requete.headers.get('Authorization') === 'Bearer nouveau'
          ? Response.json({ ok: true })
          : erreur(401, 'INVALID_ACCESS_TOKEN'),
    });
    const client = new ClientApi();
    await client.connecter('a@exemple.fr', 'motdepasse');

    expect(await client.requete('/api/cellar')).toEqual({ ok: true });
    expect(serveur.appels(REFRESH)).toHaveLength(1);
    expect(jetonsVus).toBe(2);
  });

  it('plusieurs 401 simultanés : un seul rafraîchissement, chaque requête rejouée', async () => {
    const serveur = simulerServeur({
      'POST /api/auth/login': jeton('ancien'),
      [REFRESH]: async () => {
        await new Promise((fin) => setTimeout(fin, 10));
        return jeton('nouveau');
      },
      'GET /api/cellar': (requete) =>
        requete.headers.get('Authorization') === 'Bearer nouveau'
          ? Response.json({ ok: true })
          : erreur(401, 'INVALID_ACCESS_TOKEN'),
    });
    const client = new ClientApi();
    await client.connecter('a@exemple.fr', 'motdepasse');

    const resultats = await Promise.all([1, 2, 3].map(() => client.requete('/api/cellar')));

    expect(resultats).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(serveur.appels(REFRESH)).toHaveLength(1);
    expect(serveur.appels('GET /api/cellar')).toHaveLength(6);
  });

  it('un 401 reçu après un rafraîchissement déjà fait par une autre requête : rejoue sans rafraîchir', async () => {
    const serveur = simulerServeur({
      'POST /api/auth/login': jeton('ancien'),
      [REFRESH]: jeton('nouveau'),
      // La réponse de /api/cellar arrive après que /api/account a obtenu un jeton neuf.
      'GET /api/cellar': async (requete) => {
        if (requete.headers.get('Authorization') === 'Bearer nouveau') return Response.json({ ok: true });
        await new Promise((fin) => setTimeout(fin, 20));
        return erreur(401, 'INVALID_ACCESS_TOKEN');
      },
      'GET /api/account': (requete) =>
        requete.headers.get('Authorization') === 'Bearer nouveau'
          ? Response.json({})
          : erreur(401, 'INVALID_ACCESS_TOKEN'),
    });
    const client = new ClientApi();
    await client.connecter('a@exemple.fr', 'motdepasse');

    const lente = client.requete('/api/cellar');
    await client.requete('/api/account');

    expect(await lente).toEqual({ ok: true });
    expect(serveur.appels(REFRESH)).toHaveLength(1);
  });

  it('ticket déjà renouvelé par un autre onglet (409) : redemande une fois', async () => {
    let essais = 0;
    const serveur = simulerServeur({
      [REFRESH]: () => (++essais === 1 ? erreur(409, 'SESSION_ALREADY_REFRESHED') : jeton('j2')),
    });
    const client = new ClientApi();

    expect(await client.rafraichir()).toBe('connectee');
    expect(serveur.appels(REFRESH)).toHaveLength(2);
  });

  it.each([
    [401, 'SESSION_INVALID'],
    [403, 'ACCESS_REVOKED'],
  ])('rafraîchissement refusé (%i %s) : session terminée, abonnés prévenus', async (statut, code) => {
    simulerServeur({ [REFRESH]: erreur(statut, code, 'Session expirée. Reconnectez-vous.') });
    const client = new ClientApi();
    const deconnexion = vi.fn();
    client.surDeconnexion(deconnexion);

    expect(await client.rafraichir()).toBe('deconnectee');
    await expect(client.requete('/api/cellar')).rejects.toMatchObject({ statut, code });
    expect(deconnexion).toHaveBeenCalledTimes(2);
  });

  it('réseau coupé : ErreurReseau, la session n’est pas terminée', async () => {
    simulerServeur({ [REFRESH]: reseauCoupe });
    const client = new ClientApi();
    const deconnexion = vi.fn();
    client.surDeconnexion(deconnexion);

    await expect(client.rafraichir()).rejects.toBeInstanceOf(ErreurReseau);
    await expect(client.requete('/api/cellar')).rejects.toBeInstanceOf(ErreurReseau);
    expect(deconnexion).not.toHaveBeenCalled();
  });

  it('service indisponible au rafraîchissement : erreur relayée, session conservée', async () => {
    simulerServeur({ [REFRESH]: erreur(503, 'AUTH_SERVICE_UNAVAILABLE', 'Service indisponible.') });
    const client = new ClientApi();
    const deconnexion = vi.fn();
    client.surDeconnexion(deconnexion);

    await expect(client.rafraichir()).rejects.toMatchObject({ statut: 503, code: 'AUTH_SERVICE_UNAVAILABLE' });
    expect(deconnexion).not.toHaveBeenCalled();
  });

  it('refus du serveur : ErreurApi avec statut, code, message et délai Retry-After', async () => {
    simulerServeur({
      'POST /api/auth/login': erreur(429, 'RATE_LIMITED', 'Trop de demandes. Réessayez plus tard.', {
        'Retry-After': '60',
      }),
    });
    const client = new ClientApi();

    const refus = await client.connecter('a@exemple.fr', 'x').catch((e: unknown) => e);

    expect(refus).toBeInstanceOf(ErreurApi);
    expect(refus).toMatchObject({
      statut: 429,
      code: 'RATE_LIMITED',
      message: 'Trop de demandes. Réessayez plus tard.',
      reessayerApres: 60,
    });
  });

  it('réponse d’erreur sans enveloppe : message générique avec le code HTTP', async () => {
    simulerServeur({ 'POST /api/auth/register': new Response('<html>', { status: 502 }) });

    await expect(
      new ClientApi().requete('/api/auth/register', { methode: 'POST', corps: {}, publique: true }),
    ).rejects.toMatchObject({ statut: 502, code: 'UNEXPECTED_RESPONSE', message: 'Réponse inattendue (code 502).' });
  });

  it('route publique : corps JSON, ni Bearer ni rafraîchissement ; 202 et 204 lus', async () => {
    const serveur = simulerServeur({
      'POST /api/auth/password/forgot': Response.json({ status: 'reset_pending' }, { status: 202 }),
      'POST /api/auth/password/reset': new Response(null, { status: 204 }),
    });
    const client = new ClientApi();

    expect(
      await client.requete('/api/auth/password/forgot', { methode: 'POST', corps: { email: 'a@b.fr' }, publique: true }),
    ).toEqual({ status: 'reset_pending' });
    expect(
      await client.requete('/api/auth/password/reset', { methode: 'POST', corps: { password: 'x' }, publique: true }),
    ).toBeUndefined();

    const [oubli] = serveur.requetes;
    expect(oubli.headers.get('Authorization')).toBeNull();
    expect(oubli.headers.get('Content-Type')).toBe('application/json');
    expect(await oubli.json()).toEqual({ email: 'a@b.fr' });
    expect(serveur.appels(REFRESH)).toHaveLength(0);
  });

  it('connexion : envoie email et mot de passe, garde le jeton en mémoire', async () => {
    const serveur = simulerServeur({
      'POST /api/auth/login': jeton('j1'),
      'GET /api/account': Response.json({}),
    });
    const client = new ClientApi();

    await client.connecter('a@exemple.fr', 'motdepasse');
    await client.requete('/api/account');

    expect(await serveur.appels('POST /api/auth/login')[0].json()).toEqual({
      email: 'a@exemple.fr',
      password: 'motdepasse',
    });
    expect(serveur.appels('GET /api/account')[0].headers.get('Authorization')).toBe('Bearer j1');
    expect(serveur.appels(REFRESH)).toHaveLength(0);
  });

  it('oublier : le jeton est effacé, la requête suivante rafraîchit', async () => {
    const serveur = simulerServeur({
      'POST /api/auth/login': jeton('j1'),
      [REFRESH]: erreur(401, 'SESSION_INVALID'),
    });
    const client = new ClientApi();
    await client.connecter('a@exemple.fr', 'motdepasse');

    client.oublier();

    await expect(client.requete('/api/account')).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    expect(serveur.appels(REFRESH)).toHaveLength(1);
  });

  it('corps binaire (photo) : envoyé tel quel avec son type', async () => {
    const serveur = simulerServeur({
      [REFRESH]: jeton('j1'),
      'PUT /api/photos/7b0e': new Response(null, { status: 204 }),
    });
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

    await new ClientApi().requete('/api/photos/7b0e', { methode: 'PUT', corps: photo });

    const [envoi] = serveur.appels('PUT /api/photos/7b0e');
    expect(envoi.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await envoi.text()).toBe('jpeg');
  });

  it('compte connecté : le sub du jeton, obtenu au besoin par un rafraîchissement', async () => {
    simulerServeur({ [REFRESH]: Response.json({ access_token: jwt('u-42'), expires_in: 900 }) });
    const client = new ClientApi();

    expect(client.compte()).toBeNull();
    expect(await client.compteConnecte()).toBe('u-42');
    expect(client.compte()).toBe('u-42');
  });

  it.each([['opaque'], ['a.!!!.c'], [`a.${btoa('{"sub":3}')}.c`]])('jeton sans sub lisible (%s) : aucun compte', async (valeur) => {
    simulerServeur({ [REFRESH]: jeton(valeur) });
    const client = new ClientApi();

    expect(await client.compteConnecte()).toBeNull();
  });
});
