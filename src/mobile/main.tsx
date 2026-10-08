import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/baloo-2';
import { setLanguage } from '../shared/i18n';
import MobileApp from './MobileApp';
import './mobile.css';

// The phone's own language: English phones get English, everything else Vietnamese.
setLanguage(navigator.language.toLowerCase().startsWith('en') ? 'en' : 'vi');

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Không tìm thấy #root trong mobile/index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>
);
