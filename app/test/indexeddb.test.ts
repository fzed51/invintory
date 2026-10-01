import { describe, expect, it } from 'vitest';

/** Ouvre une base IndexedDB à usage unique avec un magasin « bouteilles ». */
function ouvrirBase(nom: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const requete = indexedDB.open(nom, 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore('bouteilles', { keyPath: 'client_ref' });
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
  });
}

function attendre<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
  });
}

describe('IndexedDB simulé (fake-indexeddb)', () => {
  it('écrit puis relit un enregistrement', async () => {
    const base = await ouvrirBase(`test-${crypto.randomUUID()}`);

    await attendre(base.transaction('bouteilles', 'readwrite').objectStore('bouteilles').put({ client_ref: 'r1', type: 'rouge' }));
    const relu = await attendre(base.transaction('bouteilles').objectStore('bouteilles').get('r1'));

    expect(relu).toEqual({ client_ref: 'r1', type: 'rouge' });
    base.close();
  });

  it('rejette un doublon de clé à l’insertion', async () => {
    const base = await ouvrirBase(`test-${crypto.randomUUID()}`);
    const magasin = () => base.transaction('bouteilles', 'readwrite').objectStore('bouteilles');

    await attendre(magasin().add({ client_ref: 'r1' }));

    await expect(attendre(magasin().add({ client_ref: 'r1' }))).rejects.toMatchObject({ name: 'ConstraintError' });
    base.close();
  });
});
