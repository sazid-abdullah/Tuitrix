import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSentry, getReactRootErrorHandlers } from './services/sentry';
import { StoreProvider } from './store/context';
import { App } from './App';

initSentry();

ReactDOM.createRoot(document.getElementById('root')!, getReactRootErrorHandlers()).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>
);

// Register Service Worker for PWA (offline use and installability)
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        });
      })
      .catch((err) => {
        console.warn('SW registration failed:', err);
      });
  });
}
