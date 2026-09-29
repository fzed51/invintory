import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { appliquerThemeAuto } from './theme.ts';
import './design/tokens.css';
import './design/components.css';

appliquerThemeAuto();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
