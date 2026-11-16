import { Payment, Resident } from '../types';
import { getMonthName, formatIDR, normalizePaymentStatus, resolveResidentPaymentForMonth } from '../utils';

export const NOTIFICATION_DB_NAME = 'grand-hannan-pwa';
export const NOTIFICATION_STORE_NAME = 'state';
export const NOTIFICATION_STATE_KEY = 'residentNotificationState';
export const PERIODIC_SYNC_TAG = 'monthly-dues-check';

export interface ResidentNotificationState {
  role: 'resident';
  residentId: string;
  residentName: string;
  monthlyDues: number;
  settledPeriods: string[];
  lastNotifiedPeriod?: string;
  lastNotifiedDate?: string;
  updatedAt: string;
}

export function getPeriodKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

export function getDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function buildSettledPeriods(payments: Payment[], residentId: string, referenceDate: Date = new Date()): string[] {
  const settled = new Set<string>();
  const currentYear = referenceDate.getFullYear();

  // Check all payment records for this resident across recent/upcoming months & recorded years
  for (const p of payments) {
    if (p.residentId !== residentId) continue;
    const status = normalizePaymentStatus(p);
    if (status === 'verified' || status === 'pending') {
      settled.add(`${Number(p.year)}-${Number(p.month)}`);
    }
  }

  // Ensure authoritative resolution for current & next month
  for (let m = 1; m <= 12; m++) {
    const resolved = resolveResidentPaymentForMonth(payments, residentId, m, currentYear);
    if (resolved) {
      const status = normalizePaymentStatus(resolved);
      if (status === 'verified' || status === 'pending') {
        settled.add(`${currentYear}-${m}`);
      }
    }
  }

  return Array.from(settled);
}

function openNotificationDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }
    const request = indexedDB.open(NOTIFICATION_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTIFICATION_STORE_NAME)) {
        db.createObjectStore(NOTIFICATION_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB'));
  });
}

export async function getResidentNotificationState(): Promise<ResidentNotificationState | null> {
  try {
    const db = await openNotificationDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(NOTIFICATION_STORE_NAME, 'readonly');
      const store = tx.objectStore(NOTIFICATION_STORE_NAME);
      const req = store.get(NOTIFICATION_STATE_KEY);
      req.onsuccess = () => resolve((req.result as ResidentNotificationState) || null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function saveResidentNotificationState(state: ResidentNotificationState): Promise<void> {
  try {
    const db = await openNotificationDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOTIFICATION_STORE_NAME, 'readwrite');
      const store = tx.objectStore(NOTIFICATION_STORE_NAME);
      const req = store.put(state, NOTIFICATION_STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Ignore storage failures in restricted contexts
  }
}

export async function clearResidentNotificationState(): Promise<void> {
  try {
    const db = await openNotificationDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOTIFICATION_STORE_NAME, 'readwrite');
      const store = tx.objectStore(NOTIFICATION_STORE_NAME);
      const req = store.delete(NOTIFICATION_STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Ignore storage failures in restricted contexts
  }
}

export interface DueNotificationEvaluation {
  shouldNotify: boolean;
  periodKey: string;
  title: string;
  body: string;
  tag: string;
}

/**
 * Evaluates whether the resident smartphone notification should fire.
 * - Only fires for residents (`role === 'resident'`).
 * - Never fires if the current month is already settled (`verified` or `pending`).
 * - Fires automatically on the 1st of the month AND at most once per day while current month dues remain unpaid.
 */
export function evaluateFirstOfMonthDue(
  state: ResidentNotificationState | null,
  now: Date = new Date()
): DueNotificationEvaluation {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const day = now.getDate();
  const periodKey = `${year}-${month}`;
  const todayKey = getDateKey(now);
  const monthName = getMonthName(month);
  const tag = `grand-hannan-due-${todayKey}`;

  if (!state || state.role !== 'resident') {
    return { shouldNotify: false, periodKey, title: '', body: '', tag };
  }

  if (state.settledPeriods.includes(periodKey)) {
    return { shouldNotify: false, periodKey, title: '', body: '', tag };
  }

  if (state.lastNotifiedDate === todayKey) {
    return { shouldNotify: false, periodKey, title: '', body: '', tag };
  }

  const amountText = formatIDR(state.monthlyDues || 150000);
  const firstName = (state.residentName || 'Warga').trim().split(/\s+/)[0];

  const body =
    day === 1
      ? `Halo ${firstName}, hari ini awal bulan ${monthName} ${year}. Tagihan iuran warga sebesar ${amountText} telah tersedia. Ketuk untuk bayar.`
      : `Halo ${firstName}, iuran bulan ${monthName} ${year} sebesar ${amountText} belum lunas. Ketuk untuk segera unggah bukti pembayaran.`;

  return {
    shouldNotify: true,
    periodKey,
    tag,
    title: `Pengingat Iuran ${monthName} ${year}`,
    body,
  };
}

export async function showSmartphoneNotification(
  title: string,
  options: NotificationOptions & { data?: Record<string, unknown> }
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const payload: NotificationOptions = {
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    ...options,
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, payload);
        return true;
      }
    }
  } catch (err) {
    console.warn('Service Worker showNotification gagal, mencoba fallback:', err);
  }

  try {
    new Notification(title, payload);
    return true;
  } catch {
    return false;
  }
}

export async function registerMonthlyPeriodicSync(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const periodicSync = (reg as ServiceWorkerRegistration & {
      periodicSync?: {
        register: (tag: string, options?: { minInterval: number }) => Promise<void>;
      };
    }).periodicSync;

    if (periodicSync && typeof periodicSync.register === 'function') {
      // Request ~12 hour periodic wake-up so the 1st of the month is caught promptly
      await periodicSync.register(PERIODIC_SYNC_TAG, {
        minInterval: 12 * 60 * 60 * 1000,
      });
      return true;
    }
  } catch {
    // Periodic Background Sync is optional and only available on supported installed PWAs
  }
  return false;
}

export async function syncResidentAndCheckMonthlyDue(
  resident: Resident,
  payments: Payment[],
  options: { now?: Date } = {}
): Promise<boolean> {
  const now = options.now || new Date();
  const todayKey = getDateKey(now);
  const existing = await getResidentNotificationState();
  const settledPeriods = buildSettledPeriods(payments, resident.id, now);

  const sameResident = existing?.residentId === resident.id;
  const nextState: ResidentNotificationState = {
    role: 'resident',
    residentId: resident.id,
    residentName: resident.name,
    monthlyDues: resident.monthlyDues || 150000,
    settledPeriods,
    lastNotifiedPeriod: sameResident ? existing?.lastNotifiedPeriod : undefined,
    lastNotifiedDate: sameResident ? existing?.lastNotifiedDate : undefined,
    updatedAt: now.toISOString(),
  };

  await saveResidentNotificationState(nextState);

  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  const evaluation = evaluateFirstOfMonthDue(nextState, now);
  if (!evaluation.shouldNotify) {
    return false;
  }

  const shown = await showSmartphoneNotification(evaluation.title, {
    body: evaluation.body,
    tag: evaluation.tag,
    data: {
      url: '/?view=payments',
      periodKey: evaluation.periodKey,
    },
  });

  if (shown) {
    await saveResidentNotificationState({
      ...nextState,
      lastNotifiedPeriod: evaluation.periodKey,
      lastNotifiedDate: todayKey,
      updatedAt: new Date().toISOString(),
    });
  }

  return shown;
}
