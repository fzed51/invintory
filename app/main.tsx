import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { ClientApi } from './session/clientApi.ts';
import { appliquerTheme } from './theme.ts';
import './design/tokens.css';
import './design/components.css';

appliquerTheme();

const racine = createRoot(document.getElementById('root')!);

// Catalogue des composants : développement uniquement. En production, la condition vaut
// false à la compilation et le module n'est pas embarqué.
if (import.meta.env.DEV && window.location.pathname === '/catalogue') {
  void import('./catalogue/Catalogue.tsx').then(({ Catalogue }) =>
    racine.render(
      <StrictMode>
        <Catalogue />
      </StrictMode>,
    ),
  );
} else {
  racine.render(
    <StrictMode>
      <BrowserRouter>
        <App client={new ClientApi()} />
      </BrowserRouter>
    </StrictMode>,
  );
}
