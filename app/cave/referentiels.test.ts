import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseHorsLigne } from '../hors-ligne/base.ts';
import { ClientApi } from '../session/clientApi.ts';
import { jwt, reseauCoupe, simulerServeur } from '../test/serveur.ts';
import { lireReferentiel } from './referentiels.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function preparer(routes: Parameters<typeof simulerServeur>[0]) {
  const compte = crypto.randomUUID();
  simulerServeur({ 'POST /api/auth/refresh': Response.json({ access_token: jwt(compte), expires_in: 900 }), ...routes });
  return { client: new ClientApi(), base: new BaseHorsLigne(compte) };
}

describe('Référentiels régions et cépages (contrat §6)', () => {
  it('en ligne : noms du référentiel complet, gardés pour l’autocomplétion hors ligne', async () => {
    const { client, base } = preparer({
      'GET /api/regions': Response.json({ regions: [{ id: 5, name: 'Bordeaux' }, { id: 6, name: 'Loire' }] }),
      'GET /api/grapes': Response.json({ grapes: [{ id: 9, name: 'Merlot' }] }),
    });

    expect(await lireReferentiel(client, base, 'regions')).toEqual(['Bordeaux', 'Loire']);
    expect(await lireReferentiel(client, base, 'grapes')).toEqual(['Merlot']);
    expect((await base.lectures.get('/api/regions'))?.corps).toEqual({ regions: [{ id: 5, name: 'Bordeaux' }, { id: 6, name: 'Loire' }] });
  });

  it('hors ligne : la dernière copie', async () => {
    const { client, base } = preparer({ 'GET /api/regions': reseauCoupe });
    await base.lectures.put({ route: '/api/regions', corps: { regions: [{ id: 5, name: 'Bordeaux' }] }, recueLe: '2026-10-14T00:00:00.000Z' });

    expect(await lireReferentiel(client, base, 'regions')).toEqual(['Bordeaux']);
  });

  it('hors ligne sans copie, ou sans base locale et sans réseau : aucune proposition', async () => {
    const { client, base } = preparer({ 'GET /api/grapes': reseauCoupe });

    expect(await lireReferentiel(client, base, 'grapes')).toEqual([]);
    expect(await lireReferentiel(client, null, 'grapes')).toEqual([]);
  });

  it('sans base locale (jeton sans compte) : réseau seul', async () => {
    const { client } = preparer({ 'GET /api/grapes': Response.json({ grapes: [{ id: 9, name: 'Merlot' }] }) });

    expect(await lireReferentiel(client, null, 'grapes')).toEqual(['Merlot']);
  });
});
