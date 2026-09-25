import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/baloo-2';
import Overlay from './Overlay';
import './overlay.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Không tìm thấy #root trong overlay.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <Overlay />
  </StrictMode>
);
