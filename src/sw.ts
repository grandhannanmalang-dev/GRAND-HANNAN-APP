import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import {
  PERIODIC_SYNC_TAG,
  evaluateFirstOfMonthDue,
  getDateKey,
  getResidentNotificationState,
  saveResidentNotificationState,
} from './utils/monthlyNotifications';

interface ExtendableLikeEvent extends Event {
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SWNotificationClickEvent extends ExtendableLikeEvent {
  notification: Notification & { data?: { url?: string } };
}

interface SWPeriodicSyncEvent extends ExtendableLikeEvent {
  tag: string;
}

interface SWWindowClient {
  url: string;
  focused?: boolean;
  focus: () => Promise<SWWindowClient>;
  navigate?: (url: string) => Promise<SWWindowClient | null>;
  postMessage: (message: unknown) => void;
}

interface SWScope {
  location: Location;
  skipWaiting: () => Promise<void>;
  registration: ServiceWorkerRegistration;
  clients: {
    matchAll: (options?: { type?: string; includeUncontrolled?: boolean }) => Promise<SWWindowClient[]>;
    openWindow: (url: string) => Promise<SWWindowClient | null>;
  };
  addEventListener: (type: string, listener: (event: any) => void) => void;
}

const sw = self as unknown as SWScope;

clientsClaim();
sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void sw.skipWaiting();
  }
});

cleanupOutdatedCaches();
precacheAndRoute((self as unknown as { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }).__WB_MANIFEST);

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

async function checkAndNotifyMonthlyDueInBackground(): Promise<void> {
  const state = await getResidentNotificationState();
  const evaluation = evaluateFirstOfMonthDue(state, new Date());

  if (!evaluation.shouldNotify || !state) {
    return;
  }

  await sw.registration.showNotification(evaluation.title, {
    body: evaluation.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: evaluation.tag,
    data: {
      url: '/?view=payments',
      periodKey: evaluation.periodKey,
    },
  });

  const now = new Date();
  await saveResidentNotificationState({
    ...state,
    lastNotifiedPeriod: evaluation.periodKey,
    lastNotifiedDate: getDateKey(now),
    updatedAt: now.toISOString(),
  });
}

sw.addEventListener('periodicsync', (event: SWPeriodicSyncEvent) => {
  if (event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(checkAndNotifyMonthlyDueInBackground());
  }
});

sw.addEventListener('notificationclick', (event: SWNotificationClickEvent) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/?view=payments';

  event.waitUntil(
    (async () => {
      const windowClients = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url.startsWith(sw.location.origin)) {
          await client.focus();
          client.postMessage({ type: 'OPEN_VIEW', view: 'payments' });
          return;
        }
      }

      if (sw.clients.openWindow) {
        await sw.clients.openWindow(targetUrl);
      }
    })()
  );
});
