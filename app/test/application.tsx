import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../App.tsx';
import { ClientApi } from '../session/clientApi.ts';

/**
 * Rend l'application complète à une adresse, avec un client neuf (fetch simulé par
 * simulerServeur). Le module virtual:pwa-register/react doit être simulé par le test.
 */
export function ouvrir(chemin: string) {
  const client = new ClientApi();
  const rendu = render(
    <MemoryRouter initialEntries={[chemin]}>
      <App client={client} />
    </MemoryRouter>,
  );
  return { client, ...rendu };
}
