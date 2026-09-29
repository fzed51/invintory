import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

function simulerFetch(reponse: Response | Error) {
  const fetchMock = vi.fn(() =>
    reponse instanceof Error ? Promise.reject(reponse) : Promise.resolve(reponse),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('affiche la réponse de /api/health', async () => {
    const fetchMock = simulerFetch(Response.json({ status: 'ok' }));

    render(<App />);

    expect(await screen.findByText(/"status":"ok"/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
  });

  it("affiche l'erreur de l'enveloppe quand l'API refuse", async () => {
    simulerFetch(
      Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.' } }, { status: 500 }),
    );

    render(<App />);

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Erreur interne du serveur.');
  });

  it("affiche une erreur quand l'API est injoignable", async () => {
    simulerFetch(new TypeError('Failed to fetch'));

    render(<App />);

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Failed to fetch');
  });
});
