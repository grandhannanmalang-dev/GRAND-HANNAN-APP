import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  let isRefreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        if (navigator.onLine) {
          void registration.update().catch(() => {});
        }
      };

      checkForUpdate();
      window.setInterval(checkForUpdate, 5 * 60 * 1000);
      window.addEventListener('online', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkForUpdate();
        }
      });
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
