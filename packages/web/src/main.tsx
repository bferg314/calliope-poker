import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/instrument-sans';
import './styles/tokens.css';
import './styles/base.css';
import './styles/table.css';
import { App } from './app.js';
import { armBell } from './bell.js';
import { initDecks } from './decks.js';
import { applyStoredTheme } from './themes.js';

applyStoredTheme();
void initDecks();
armBell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
