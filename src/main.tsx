import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/baloo-2';
import App from './App';
import { LANGUAGE_STORAGE_KEY, setLanguage } from './shared/i18n';
import './styles.css';

try {
  setLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
} catch {
  // Storage blocked: stay in Vietnamese.
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Không tìm thấy #root trong index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
