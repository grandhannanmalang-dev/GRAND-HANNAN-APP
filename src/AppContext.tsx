import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  collection,
  doc,
  setDoc,
  getDocFromServer,
  getDocsFromServer,
  updateDoc,
  deleteDoc,
  deleteField,
  writeBatch,
  onSnapshot,
  query,
  where,
  waitForPendingWrites,
  arrayUnion,
} from 'firebase/firestore';
import { Resident, Payment, AppUser, AppNotification, Expense, BankAccount, OrganizationContact, AddNotificationOptions } from './types';
import { initialResidents, initialPayments } from './data';
import {
  generateId,
  getMonthName,
  formatIDR,
  cleanFirestoreData,
  normalizePaymentStatus,
  translateErrorToIndonesian,
  safeTimeMs,
  getResidentPaymentSummary,
  isNotificationReadForUser,
  isNotificationVisibleForUser,
} from './utils';
import { db, auth, updatePassword, handleFirestoreError, OperationType } from './firebase';
import {
  clearResidentNotificationState,
  getDateKey,
  registerMonthlyPeriodicSync,
  syncResidentAndCheckMonthlyDue,
} from './utils/monthlyNotifications';

const LEGACY_LOCAL_STORAGE_KEYS = [
  'app_residents',
  'app_payments',
  'app_expenses',
  'app_notifications',
  'app_bank_account',
  'app_users',
] as const;

const SESSION_STORAGE_KEY = 'app_session';

const DEFAULT_BANK_ACCOUNT: BankAccount = {
  bankName: 'BCA',
  accountNumber: '1234 5678 90',
  accountName: 'Paguyuban Grand Hannan',
};

function purgeLegacyLocalCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
}

purgeLegacyLocalCaches();

const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (item && item.id) {
      seen.set(item.id, item);
    }
  }
  return Array.from(seen.values());
};

interface AppContextType {
  currentUser: AppUser | null;
  isLoadingAuth: boolean;
  isOnline: boolean;
  syncMode: 'realtime' | 'polling';
  isHydratingCloud: boolean;
  isRefreshingCloud: boolean;
  hasCloudHydrated: boolean;
  cloudSyncError: string | null;
  cloudSyncErrorDetail: string | null;
  authNotice: string | null;
  clearAuthNotice: () => void;
  retryCloudSync: () => void;
  refreshCloudNow: () => Promise<void>;
  signInUser: (user: AppUser) => void;
  residents: Resident[];
  syncingResidentName: string | null;
  hasPendingResidentSync: boolean;
  payments: Payment[];
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  expenses: Expense[];
  addResident: (resident: Resident, idLogin?: string, password?: string) => Promise<void>;
  addPayment: (payment: Payment) => Promise<void>;
  updatePayment: (id: string, updatedData: Partial<Payment>) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  addExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  updateResident: (id: string, updatedData: Partial<Resident>, newPassword?: string) => Promise<void>;
  deleteResident: (id: string) => Promise<void>;
  signOutUser: (notice?: string) => Promise<void>;
  addNotification: (
    title: string,
    message: string,
    targetViewOrOptions?: AppNotification['targetView'] | AddNotificationOptions
  ) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  bankAccount: BankAccount;
  updateBankAccount: (bankAccount: BankAccount) => Promise<void>;
  organizationContacts: OrganizationContact[];
  updateOrganizationContacts: (contacts: OrganizationContact[]) => Promise<void>;
  updateProfilePhoto: (photoUrl: string | null) => Promise<void>;
  updateOwnPassword: (newPassword: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const formatDiagnosticError = (error: unknown, source?: string): { message: string; detail: string } => {
  const friendly = translateErrorToIndonesian(
    error,
    'Gagal memuat data dari cloud. Pastikan perangkat terhubung ke internet.'
  );
  const errObj = error as { code?: unknown; message?: unknown } | null;
  const code = typeof errObj?.code === 'string' && errObj.code ? errObj.code : '';
  let rawMessage = error instanceof Error ? error.message : String(error ?? '');
  if (rawMessage.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) {
        rawMessage = parsed.error;
      }
    } catch {
      // Keep original string
    }
  }
  const truncated = rawMessage.length > 180 ? `${rawMessage.slice(0, 180)}...` : rawMessage;
  const parts = [
    source ? `Jalur: ${source}` : '',
    code ? `Kode: ${code}` : '',
    truncated ? truncated : '',
  ].filter(Boolean);

  return {
    message: friendly,
    detail: parts.join(' · ') || 'Tidak ada detail tambahan.',
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncMode, setSyncMode] = useState<'realtime' | 'polling'>('realtime');
  const [isHydratingCloud, setIsHydratingCloud] = useState<boolean>(true);
  const [isRefreshingCloud, setIsRefreshingCloud] = useState<boolean>(false);
  const [hasCloudHydrated, setHasCloudHydrated] = useState<boolean>(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [cloudSyncErrorDetail, setCloudSyncErrorDetail] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [syncGeneration, setSyncGeneration] = useState<number>(0);
  const [syncingResidentName, setSyncingResidentName] = useState<string | null>(null);
  const [hasPendingResidentSync, setHasPendingResidentSync] = useState(false);

  // Cloud-only states (never initialized from localStorage or dummy data)
  const [rawResidents, setResidents] = useState<Resident[]>([]);
  const [userPhotoMap, setUserPhotoMap] = useState<{
    byUid: Record<string, string>;
    byResidentId: Record<string, string>;
  }>({ byUid: {}, byResidentId: {} });
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rawNotifications, setRawNotifications] = useState<AppNotification[]>([]);
  const [bankAccount, setBankAccount] = useState<BankAccount>(DEFAULT_BANK_ACCOUNT);
  const [organizationContacts, setOrganizationContacts] = useState<OrganizationContact[]>([]);
  const [currentDateKey, setCurrentDateKey] = useState<string>(() => getDateKey());

  const residents = useMemo(
    () =>
      rawResidents.map((r) => {
        const syncedPhoto =
          r.photoUrl ||
          (r.userId ? userPhotoMap.byUid[r.userId] : undefined) ||
          userPhotoMap.byResidentId[r.id];
        if (!syncedPhoto || r.photoUrl === syncedPhoto) return r;
        return { ...r, photoUrl: syncedPhoto };
      }),
    [rawResidents, userPhotoMap]
  );
  const [ackedReminderByUser, setAckedReminderByUser] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('grand_hannan_reminder_ack');
      return saved ? (JSON.parse(saved) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  const hydratedStreamsRef = useRef<Set<string>>(new Set());
  const hasCloudHydratedRef = useRef<boolean>(false);
  const localPasswordUpdateAtRef = useRef<string | null>(null);
  const currentUserUidRef = useRef<string | null>(null);
  const currentUserRef = useRef<AppUser | null>(null);
  const residentsRef = useRef<Resident[]>([]);
  const rawNotificationsRef = useRef<AppNotification[]>([]);
  const visibleCloudNotificationsRef = useRef<AppNotification[]>([]);
  const isOnlineRef = useRef<boolean>(isOnline);

  useEffect(() => {
    currentUserUidRef.current = currentUser?.uid ?? null;
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    residentsRef.current = residents;
  }, [residents]);

  useEffect(() => {
    rawNotificationsRef.current = rawNotifications;
  }, [rawNotifications]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const assertOnline = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error(
        'Perangkat sedang offline. Hubungkan ke internet agar perubahan tersimpan di cloud dan identik di semua perangkat.'
      );
    }
  }, []);

  const clearAuthNotice = useCallback(() => {
    setAuthNotice(null);
  }, []);

  const retryCloudSync = useCallback(() => {
    setCloudSyncError(null);
    setCloudSyncErrorDetail(null);
    setSyncMode('realtime');
    setIsHydratingCloud(true);
    setSyncGeneration((prev) => prev + 1);
  }, []);

  const persistSession = useCallback((user: AppUser | null) => {
    try {
      if (user) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const signInUser = useCallback(
    (user: AppUser) => {
      setAuthNotice(null);
      localPasswordUpdateAtRef.current = user.passwordUpdatedAt ?? null;
      currentUserUidRef.current = user.uid;
      persistSession(user);
      setCurrentUser(user);
      if (!hasCloudHydratedRef.current) {
        setCloudSyncError(null);
        setCloudSyncErrorDetail(null);
        setSyncMode('realtime');
        setIsHydratingCloud(true);
        setSyncGeneration((prev) => prev + 1);
      }
    },
    [persistSession]
  );

  const signOutUser = useCallback(
    async (notice?: unknown) => {
      localPasswordUpdateAtRef.current = null;
      currentUserUidRef.current = null;
      persistSession(null);
      void clearResidentNotificationState();
      setCurrentUser(null);
      const safeNotice = typeof notice === 'string' && notice.trim() ? notice.trim() : undefined;
      if (safeNotice) {
        setAuthNotice(safeNotice);
      }
    },
    [persistSession]
  );

  const applySyncedUserDoc = useCallback(
    (exists: boolean, data?: Record<string, any>) => {
      if (!exists || !data) {
        void signOutUser('Akun Anda telah dihapus atau tidak lagi terdaftar di sistem.');
        return;
      }

      if (data.role !== 'admin' && data.role !== 'resident') {
        void signOutUser('Peran akun Anda tidak valid. Silakan hubungi pengurus.');
        return;
      }

      const cloudPwdUpdatedAt =
        typeof data.passwordUpdatedAt === 'string' ? data.passwordUpdatedAt : undefined;
      const localPwdUpdatedAt = localPasswordUpdateAtRef.current;

      if (cloudPwdUpdatedAt && localPwdUpdatedAt && cloudPwdUpdatedAt !== localPwdUpdatedAt) {
        void signOutUser('Password akun telah diubah dari perangkat lain. Silakan login kembali.');
        return;
      }

      setCurrentUser((prev) => {
        if (!prev) return prev;
        const nextName = data.name ?? prev.name;
        const nextEmail = data.email ?? prev.email;
        const nextPhoto = data.photoUrl;
        const nextRole = data.role;
        const nextResidentId = data.residentId ?? prev.residentId;
        const nextPwdUpdatedAt = cloudPwdUpdatedAt ?? prev.passwordUpdatedAt;

        if (
          prev.name === nextName &&
          prev.email === nextEmail &&
          prev.photoUrl === nextPhoto &&
          prev.role === nextRole &&
          prev.residentId === nextResidentId &&
          prev.passwordUpdatedAt === nextPwdUpdatedAt
        ) {
          return prev;
        }

        const updated: AppUser = {
          ...prev,
          email: nextEmail,
          role: nextRole,
          ...(nextName ? { name: nextName } : {}),
          ...(nextPhoto ? { photoUrl: nextPhoto } : {}),
          ...(nextResidentId ? { residentId: nextResidentId } : {}),
          ...(nextPwdUpdatedAt ? { passwordUpdatedAt: nextPwdUpdatedAt } : {}),
        };

        if (!nextPhoto) {
          delete updated.photoUrl;
        }
        if (nextPwdUpdatedAt) {
          localPasswordUpdateAtRef.current = nextPwdUpdatedAt;
        }
        persistSession(updated);
        return updated;
      });
    },
    [persistSession, signOutUser]
  );

  const ensureCloudInitialized = useCallback(async () => {
    // 1. Ensure official Admin exists in cloud Firestore (read from server so we never overwrite changed passwords)
    const adminDocRef = doc(db, 'users', 'admin_uid');
    const adminSnap = await getDocFromServer(adminDocRef);
    if (!adminSnap.exists()) {
      await setDoc(adminDocRef, {
        uid: 'admin_uid',
        email: 'admin',
        name: 'Admin Paguyuban',
        password: 'admin99',
        role: 'admin',
      });
    }

    // 2. Ensure bankAccount exists in Firestore
    const bankDocRef = doc(db, 'settings', 'bankAccount');
    const bankSnap = await getDocFromServer(bankDocRef);
    if (!bankSnap.exists()) {
      await setDoc(bankDocRef, DEFAULT_BANK_ACCOUNT);
    }

    // 3. One-time initial sample seed guarded by settings/systemMeta.initialSeedCompleted
    const metaDocRef = doc(db, 'settings', 'systemMeta');
    const metaSnap = await getDocFromServer(metaDocRef);
    const alreadySeeded = Boolean(metaSnap.exists() && metaSnap.data()?.initialSeedCompleted);

    if (!alreadySeeded) {
      const [resSnap, paySnap] = await Promise.all([
        getDocsFromServer(collection(db, 'residents')),
        getDocsFromServer(collection(db, 'payments')),
      ]);

      const seedOps: Array<{ ref: ReturnType<typeof doc>; data: Record<string, any> }> = [];
      if (resSnap.empty) {
        for (const res of initialResidents) {
          seedOps.push({ ref: doc(db, 'residents', res.id), data: cleanFirestoreData(res) });
        }
      }
      if (paySnap.empty) {
        for (const pay of initialPayments) {
          seedOps.push({ ref: doc(db, 'payments', pay.id), data: cleanFirestoreData(pay) });
        }
      }

      for (let i = 0; i < seedOps.length; i += 400) {
        const batch = writeBatch(db);
        for (const op of seedOps.slice(i, i + 400)) {
          batch.set(op.ref, op.data);
        }
        await batch.commit();
      }

      await setDoc(
        metaDocRef,
        {
          initialSeedCompleted: true,
          seededAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    // 4. Automated 1st of the Month Payment Reminder Notification
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const reminderId = `reminder_iuran_${curYear}_${curMonth}`;
    const reminderRef = doc(db, 'notifications', reminderId);
    const reminderSnap = await getDocFromServer(reminderRef);

    if (!reminderSnap.exists()) {
      const monthName = getMonthName(curMonth);
      const reminderNotif: AppNotification = {
        id: reminderId,
        title: `Pengingat Pembayaran Iuran Bulan ${monthName} ${curYear}`,
        message: `Halo Warga Grand Hannan, setiap tanggal 1 adalah jadwal dimulainya pembayaran iuran bulanan periode ${monthName} ${curYear}. Mohon segera lakukan pembayaran transfer ke rekening paguyuban dan unggah bukti transfer. Terima kasih atas kerja samanya!`,
        date: new Date(curYear, curMonth - 1, 1, 7, 0, 0).toISOString(),
        read: false,
        readBy: [],
        targetView: 'payments',
        audience: 'all',
        category: 'reminder',
      };
      await setDoc(reminderRef, reminderNotif);
    }
  }, []);

  const fetchAllCollectionsViaHttps = useCallback(async () => {
    const activeUid = currentUserUidRef.current;
    const [resSnap, paySnap, expSnap, notifSnap, bankSnap, orgSnap, usersSnap] = await Promise.all([
      getDocsFromServer(collection(db, 'residents')),
      getDocsFromServer(collection(db, 'payments')),
      getDocsFromServer(collection(db, 'expenses')),
      getDocsFromServer(collection(db, 'notifications')),
      getDocFromServer(doc(db, 'settings', 'bankAccount')),
      getDocFromServer(doc(db, 'settings', 'organization')),
      getDocsFromServer(collection(db, 'users')).catch(() => null),
    ]);

    const cloudResidents = dedupeById(
      resSnap.docs.map((d) => ({ ...d.data(), id: d.id } as Resident))
    );
    const cloudPayments = dedupeById(
      paySnap.docs.map((d) => {
        const raw = { ...d.data(), id: d.id } as Payment;
        return { ...raw, status: normalizePaymentStatus(raw) };
      })
    );
    const cloudExpenses = dedupeById(
      expSnap.docs.map((d) => ({ ...d.data(), id: d.id } as Expense))
    );
    const cloudNotifs = dedupeById(
      notifSnap.docs.map((d) => ({ ...d.data(), id: d.id } as AppNotification))
    );
    cloudNotifs.sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));

    setResidents(cloudResidents);
    setPayments(cloudPayments);
    setExpenses(cloudExpenses);
    setRawNotifications(cloudNotifs);
    if (bankSnap.exists()) {
      setBankAccount(bankSnap.data() as BankAccount);
    }
    if (orgSnap.exists()) {
      const data = orgSnap.data() as { contacts?: OrganizationContact[] };
      setOrganizationContacts(Array.isArray(data.contacts) ? data.contacts : []);
    } else {
      setOrganizationContacts([]);
    }
    if (usersSnap) {
      const byUid: Record<string, string> = {};
      const byResidentId: Record<string, string> = {};
      let activeUserSnapData: Record<string, any> | undefined;
      let activeUserFound = false;

      usersSnap.docs.forEach((d) => {
        const data = d.data();
        if (typeof data.photoUrl === 'string' && data.photoUrl) {
          byUid[d.id] = data.photoUrl;
          if (typeof data.uid === 'string' && data.uid) {
            byUid[data.uid] = data.photoUrl;
          }
          if (typeof data.residentId === 'string' && data.residentId) {
            byResidentId[data.residentId] = data.photoUrl;
          }
        }
        if (activeUid && (d.id === activeUid || data.uid === activeUid)) {
          activeUserFound = true;
          activeUserSnapData = data;
        }
      });

      setUserPhotoMap({ byUid, byResidentId });
      if (activeUid) {
        applySyncedUserDoc(activeUserFound, activeUserSnapData);
      }
    } else if (activeUid) {
      try {
        const userSnap = await getDocFromServer(doc(db, 'users', activeUid));
        applySyncedUserDoc(userSnap.exists(), userSnap.data());
      } catch {
        // Ignore single user fetch failure
      }
    }
  }, [applySyncedUserDoc]);

  const refreshCloudNow = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    setIsRefreshingCloud(true);
    try {
      await fetchAllCollectionsViaHttps();
      setCloudSyncError(null);
      setCloudSyncErrorDetail(null);
    } catch (err) {
      console.warn('Manual HTTPS cloud refresh failed:', err);
    } finally {
      setIsRefreshingCloud(false);
    }
  }, [fetchAllCollectionsViaHttps]);

  // Track real-time browser connectivity & auto-recover hydration when back online
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setCloudSyncError(null);
      setCloudSyncErrorDetail(null);
      setSyncGeneration((prev) => prev + 1);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load saved lightweight session on startup & purge any legacy local data caches
  useEffect(() => {
    purgeLegacyLocalCaches();
    try {
      const session = localStorage.getItem(SESSION_STORAGE_KEY);
      if (session) {
        const parsed = JSON.parse(session) as AppUser;
        if (parsed && parsed.uid && (parsed.role === 'admin' || parsed.role === 'resident')) {
          localPasswordUpdateAtRef.current = parsed.passwordUpdatedAt ?? null;
          currentUserUidRef.current = parsed.uid;
          setCurrentUser(parsed);
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Error loading session:', e);
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Ignore
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  // One-time Cloud Initialization & Real-time Firestore Listeners with automatic HTTPS Polling Fallback
  useEffect(() => {
    let isCancelled = false;
    let fallbackStarted = false;
    let pollingTimerId: number | undefined;
    let handshakeTimerId: number | undefined;
    hydratedStreamsRef.current = new Set();

    const unsubscribers: Array<() => void> = [];
    const cleanupRealtimeListeners = () => {
      while (unsubscribers.length > 0) {
        const unsub = unsubscribers.pop();
        try {
          unsub?.();
        } catch {
          // Ignore unsubscribe errors
        }
      }
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!hasCloudHydratedRef.current) {
        setCloudSyncError(
          'Perangkat sedang offline. Sambungkan ke internet untuk menyinkronkan data terbaru dari cloud.'
        );
        setCloudSyncErrorDetail('Jaringan perangkat dalam kondisi offline (navigator.onLine = false).');
        setIsHydratingCloud(false);
      }
      return;
    }

    setCloudSyncError(null);
    setCloudSyncErrorDetail(null);
    if (!hasCloudHydratedRef.current) {
      setIsHydratingCloud(true);
    }

    const completeHydration = (mode: 'realtime' | 'polling') => {
      if (isCancelled) return;
      if (handshakeTimerId !== undefined) {
        window.clearTimeout(handshakeTimerId);
        handshakeTimerId = undefined;
      }
      hasCloudHydratedRef.current = true;
      setHasCloudHydrated(true);
      setIsHydratingCloud(false);
      setSyncMode(mode);
      setCloudSyncError(null);
      setCloudSyncErrorDetail(null);
    };

    const activateHttpsFallback = async (triggerError: unknown, sourcePath: string) => {
      if (isCancelled || fallbackStarted) return;
      fallbackStarted = true;
      if (handshakeTimerId !== undefined) {
        window.clearTimeout(handshakeTimerId);
        handshakeTimerId = undefined;
      }
      cleanupRealtimeListeners();
      setHasPendingResidentSync(false);

      console.warn(`Switching to direct HTTPS cloud sync (${sourcePath}):`, triggerError);

      try {
        if (!hydratedStreamsRef.current.has('init')) {
          await ensureCloudInitialized();
          hydratedStreamsRef.current.add('init');
        }
        await fetchAllCollectionsViaHttps();
        if (isCancelled) return;

        completeHydration('polling');

        // Keep data synchronized across devices every 10 seconds via HTTPS
        pollingTimerId = window.setInterval(() => {
          if (isCancelled) return;
          if (typeof navigator !== 'undefined' && !navigator.onLine) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
          void fetchAllCollectionsViaHttps().catch((pollErr) => {
            console.warn('Periodic HTTPS cloud poll error:', pollErr);
          });
        }, 10000);
      } catch (fallbackErr) {
        if (isCancelled) return;
        console.error('HTTPS cloud fallback also failed:', fallbackErr);
        const diagnostic = formatDiagnosticError(fallbackErr || triggerError, sourcePath);
        if (!hasCloudHydratedRef.current) {
          setCloudSyncError(diagnostic.message);
          setCloudSyncErrorDetail(diagnostic.detail);
          setIsHydratingCloud(false);
        }
      }
    };

    const markStreamHydrated = (streamKey: string) => {
      if (isCancelled || fallbackStarted) return;
      hydratedStreamsRef.current.add(streamKey);
      if (
        hydratedStreamsRef.current.has('init') &&
        hydratedStreamsRef.current.has('residents') &&
        hydratedStreamsRef.current.has('payments') &&
        hydratedStreamsRef.current.has('expenses') &&
        hydratedStreamsRef.current.has('notifications') &&
        hydratedStreamsRef.current.has('bankAccount') &&
        hydratedStreamsRef.current.has('organization')
      ) {
        completeHydration('realtime');
      }
    };

    // If real-time WebChannel takes too long on restrictive networks, automatically fall back to HTTPS
    if (!hasCloudHydratedRef.current) {
      handshakeTimerId = window.setTimeout(() => {
        if (!isCancelled && !hasCloudHydratedRef.current && !fallbackStarted) {
          void activateHttpsFallback(
            new Error('Koneksi real-time tidak merespons dalam 10 detik.'),
            'realtime-timeout'
          );
        }
      }, 10000);
    }

    const initializeCloudData = async () => {
      try {
        await ensureCloudInitialized();
        markStreamHydrated('init');
      } catch (err) {
        if (isCancelled) return;
        console.error('Cloud initialization error:', err);
        void activateHttpsFallback(err, 'cloud-init');
      }
    };

    void initializeCloudData();

    const handleListenerError = (path: string, error: unknown) => {
      if (isCancelled) return;
      console.error(`Firestore listener error (${path}):`, error);
      setHasPendingResidentSync(false);
      void activateHttpsFallback(error, `onSnapshot/${path}`);
    };

    // 1. Listen to Residents
    unsubscribers.push(
      onSnapshot(
        collection(db, 'residents'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (isCancelled || fallbackStarted) return;
          setHasPendingResidentSync(snapshot.metadata.hasPendingWrites);
          if (snapshot.metadata.fromCache && navigator.onLine) return;
          const cloudResidents = dedupeById(
            snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Resident))
          );
          setResidents(cloudResidents);
          markStreamHydrated('residents');
        },
        (error) => handleListenerError('residents', error)
      )
    );

    // 2. Listen to Payments
    unsubscribers.push(
      onSnapshot(
        collection(db, 'payments'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (isCancelled || fallbackStarted) return;
          if (snapshot.metadata.fromCache && navigator.onLine) return;
          const cloudPayments = dedupeById(
            snapshot.docs.map((d) => {
              const raw = { ...d.data(), id: d.id } as Payment;
              return { ...raw, status: normalizePaymentStatus(raw) };
            })
          );
          setPayments(cloudPayments);
          markStreamHydrated('payments');
        },
        (error) => handleListenerError('payments', error)
      )
    );

    // 3. Listen to Expenses
    unsubscribers.push(
      onSnapshot(
        collection(db, 'expenses'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (isCancelled || fallbackStarted) return;
          if (snapshot.metadata.fromCache && navigator.onLine) return;
          const cloudExpenses = dedupeById(
            snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Expense))
          );
          setExpenses(cloudExpenses);
          markStreamHydrated('expenses');
        },
        (error) => handleListenerError('expenses', error)
      )
    );

    // 4. Listen to Notifications
    unsubscribers.push(
      onSnapshot(
        collection(db, 'notifications'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (isCancelled || fallbackStarted) return;
          if (snapshot.metadata.fromCache && navigator.onLine) return;
          const cloudNotifs = dedupeById(
            snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as AppNotification))
          );
          cloudNotifs.sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));
          setRawNotifications(cloudNotifs);
          markStreamHydrated('notifications');
        },
        (error) => handleListenerError('notifications', error)
      )
    );

    // 5. Listen to Bank Account Settings
    unsubscribers.push(
      onSnapshot(
        doc(db, 'settings', 'bankAccount'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (isCancelled || fallbackStarted) return;
          if (snapshot.metadata.fromCache && navigator.onLine) return;
          if (snapshot.exists()) {
            setBankAccount(snapshot.data() as BankAccount);
          }
          markStreamHydrated('bankAccount');
        },
        (error) => handleListenerError('settings/bankAccount', error)
      )
    );

    // 6. Listen to Organization Contacts Settings
    unsubscribers.push(
      onSnapshot(
        doc(db, 'settings', 'organization'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (isCancelled || fallbackStarted) return;
          if (snapshot.metadata.fromCache && navigator.onLine) return;
          if (snapshot.exists()) {
            const data = snapshot.data() as { contacts?: OrganizationContact[] };
            setOrganizationContacts(Array.isArray(data.contacts) ? data.contacts : []);
          } else {
            setOrganizationContacts([]);
          }
          markStreamHydrated('organization');
        },
        (error) => handleListenerError('settings/organization', error)
      )
    );

    // 7. Listen to Users profile photos so updates by any resident show across all accounts immediately
    unsubscribers.push(
      onSnapshot(
        collection(db, 'users'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (isCancelled || fallbackStarted) return;
          if (snapshot.metadata.fromCache && navigator.onLine) return;
          const byUid: Record<string, string> = {};
          const byResidentId: Record<string, string> = {};
          snapshot.docs.forEach((d) => {
            const data = d.data();
            if (typeof data.photoUrl === 'string' && data.photoUrl) {
              byUid[d.id] = data.photoUrl;
              if (typeof data.uid === 'string' && data.uid) {
                byUid[data.uid] = data.photoUrl;
              }
              if (typeof data.residentId === 'string' && data.residentId) {
                byResidentId[data.residentId] = data.photoUrl;
              }
            }
          });
          setUserPhotoMap({ byUid, byResidentId });
        },
        (err) => {
          console.warn('Firestore users photo listener error:', err);
        }
      )
    );

    return () => {
      isCancelled = true;
      if (handshakeTimerId !== undefined) {
        window.clearTimeout(handshakeTimerId);
      }
      if (pollingTimerId !== undefined) {
        window.clearInterval(pollingTimerId);
      }
      cleanupRealtimeListeners();
    };
  }, [syncGeneration, ensureCloudInitialized, fetchAllCollectionsViaHttps]);

  // Refresh immediately when app tab regains focus in HTTPS polling mode
  useEffect(() => {
    if (syncMode !== 'polling') return;
    const handleRefresh = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void fetchAllCollectionsViaHttps().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    return () => {
      document.removeEventListener('visibilitychange', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [syncMode, fetchAllCollectionsViaHttps]);

  // Track calendar day changes so crossing midnight or the 1st of the month refreshes reminders automatically
  useEffect(() => {
    const syncDateKey = () => {
      const next = getDateKey();
      setCurrentDateKey((prev) => (prev === next ? prev : next));
    };
    const intervalId = window.setInterval(syncDateKey, 60 * 1000);
    window.addEventListener('focus', syncDateKey);
    document.addEventListener('visibilitychange', syncDateKey);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncDateKey);
      document.removeEventListener('visibilitychange', syncDateKey);
    };
  }, []);

  // Ensure monthly 1st-of-month reminder doc exists if app stays open across month rollover
  useEffect(() => {
    if (!hasCloudHydrated || !isOnline) return;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const reminderId = `reminder_iuran_${curYear}_${curMonth}`;
    if (rawNotifications.some((n) => n.id === reminderId)) return;

    const reminderRef = doc(db, 'notifications', reminderId);
    void getDocFromServer(reminderRef)
      .then((snap) => {
        if (snap.exists()) return;
        const monthName = getMonthName(curMonth);
        const reminderNotif: AppNotification = {
          id: reminderId,
          title: `Pengingat Pembayaran Iuran Bulan ${monthName} ${curYear}`,
          message: `Halo Warga Grand Hannan, setiap tanggal 1 adalah jadwal dimulainya pembayaran iuran bulanan periode ${monthName} ${curYear}. Mohon segera lakukan pembayaran transfer ke rekening paguyuban dan unggah bukti transfer. Terima kasih atas kerja samanya!`,
          date: new Date(curYear, curMonth - 1, 1, 7, 0, 0).toISOString(),
          read: false,
          readBy: [],
          targetView: 'payments',
          audience: 'all',
          category: 'reminder',
        };
        return setDoc(reminderRef, reminderNotif);
      })
      .catch(() => {});
  }, [currentDateKey, hasCloudHydrated, isOnline, rawNotifications]);

  // Resident-only 1st-of-Month Smartphone Notification Sync & Periodic Check
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'resident') {
      void clearResidentNotificationState();
      return;
    }

    const linkedResident = residents.find(
      (r) => r.userId === currentUser.uid || r.id === currentUser.residentId
    );
    if (!linkedResident) return;

    const runSync = () => {
      void syncResidentAndCheckMonthlyDue(linkedResident, payments);
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        void registerMonthlyPeriodicSync();
      }
    };

    runSync();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(runSync, 30 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [currentUser, residents, payments]);

  // Real-time User Session Sync across devices (auto-logout on account delete or password change)
  useEffect(() => {
    if (!currentUser?.uid || syncMode !== 'realtime') return;

    const unsubUser = onSnapshot(
      doc(db, 'users', currentUser.uid),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.fromCache && navigator.onLine) return;
        applySyncedUserDoc(snapshot.exists(), snapshot.data());
      },
      (error) => {
        console.warn('Error syncing current user session via stream, falling back to HTTPS check:', error);
        void getDocFromServer(doc(db, 'users', currentUser.uid))
          .then((snap) => applySyncedUserDoc(snap.exists(), snap.data()))
          .catch(() => {});
      }
    );

    return () => unsubUser();
  }, [currentUser?.uid, syncMode, applySyncedUserDoc]);

  // Cloud-Confirmed Actions (No Silent Failures, Online Required)
  const addResident = useCallback(async (resident: Resident, idLogin?: string, password?: string) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat menambahkan warga baru.');
    }
    assertOnline();

    const cleanedId = (idLogin || '').trim();
    const cleanedPassword = (password || '').trim();

    if ((cleanedId && !cleanedPassword) || (!cleanedId && cleanedPassword)) {
      throw new Error('ID Pengguna dan Password harus diisi keduanya.');
    }

    setSyncingResidentName(resident.name.trim() || 'Warga baru');
    try {
      let newUid: string | undefined;
      const batch = writeBatch(db);

      if (cleanedId && cleanedPassword) {
        if (cleanedId.toLowerCase() === 'admin') {
          throw new Error('ID Pengguna "admin" tidak dapat digunakan untuk akun warga.');
        }

        const [usersSnap, resSnap] = await Promise.all([
          getDocsFromServer(collection(db, 'users')),
          getDocsFromServer(collection(db, 'residents')),
        ]);
        const existingResidentIds = new Set<string>();
        resSnap.forEach((r) => existingResidentIds.add(r.id));

        for (const u of usersSnap.docs) {
          const data = u.data();
          const matchesId =
            data.email?.toLowerCase() === cleanedId.toLowerCase() ||
            data.uid?.toLowerCase() === cleanedId.toLowerCase();
          if (matchesId) {
            const isOrphanedResidentUser =
              data.role === 'resident' &&
              (!data.residentId || !existingResidentIds.has(data.residentId));
            if (isOrphanedResidentUser) {
              batch.delete(doc(db, 'users', u.id));
            } else {
              throw new Error('ID Pengguna sudah terdaftar di sistem.');
            }
          }
        }

        newUid = `u_${generateId()}`;
        const newUserData = cleanFirestoreData({
          uid: newUid,
          email: cleanedId,
          name: resident.name.trim(),
          password: cleanedPassword,
          passwordUpdatedAt: new Date().toISOString(),
          role: 'resident',
          residentId: resident.id,
        });

        batch.set(doc(db, 'users', newUid), newUserData);
      }

      const cleanResident = cleanFirestoreData({
        ...resident,
        name: resident.name.trim(),
        houseNumber: resident.houseNumber.trim(),
        ...(resident.block?.trim() ? { block: resident.block.trim() } : {}),
        ...(resident.phone?.trim() ? { phone: resident.phone.trim() } : {}),
        ...(newUid ? { userId: newUid } : {}),
      });

      batch.set(doc(db, 'residents', resident.id), cleanResident);
      await batch.commit();
      await waitForPendingWrites(db);

      setResidents((prev) => dedupeById([...prev.filter((r) => r.id !== resident.id), cleanResident as Resident]));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `residents/${resident.id}`);
    } finally {
      setSyncingResidentName(null);
    }
  }, [assertOnline]);

  const addPayment = useCallback(async (payment: Payment) => {
    if (!currentUserRef.current) {
      throw new Error('Sesi pengguna tidak valid. Silakan login terlebih dahulu.');
    }
    assertOnline();

    try {
      const serverResPayments = await getDocsFromServer(
        query(collection(db, 'payments'), where('residentId', '==', payment.residentId))
      );

      let existingTertundaId: string | undefined;
      serverResPayments.forEach((docSnap) => {
        const p = { ...docSnap.data(), id: docSnap.id } as Payment;
        if (
          Number(p.month) === Number(payment.month) &&
          Number(p.year) === Number(payment.year) &&
          normalizePaymentStatus(p) === 'tertunda'
        ) {
          existingTertundaId = docSnap.id;
        }
      });

      const targetId = existingTertundaId || payment.id;

      const cleanPayload = cleanFirestoreData({
        id: targetId,
        residentId: payment.residentId,
        amount: Number(payment.amount),
        month: Number(payment.month),
        year: Number(payment.year),
        date: payment.date || new Date().toISOString(),
        status: payment.status || 'pending',
        ...(payment.proofOfPayment ? { proofOfPayment: payment.proofOfPayment } : {}),
      });

      await setDoc(doc(db, 'payments', targetId), cleanPayload);
      await waitForPendingWrites(db);

      setPayments((prev) => dedupeById([cleanPayload as Payment, ...prev.filter((p) => p.id !== targetId)]));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `payments/${payment.id}`);
    }
  }, [assertOnline]);

  const updatePayment = useCallback(async (id: string, updatedData: Partial<Payment>) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat mengubah status pembayaran.');
    }
    assertOnline();

    try {
      const cleanData = cleanFirestoreData(updatedData);
      await updateDoc(doc(db, 'payments', id), cleanData);
      await waitForPendingWrites(db);
      setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...cleanData } : p)));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `payments/${id}`);
    }
  }, [assertOnline]);

  const deletePayment = useCallback(async (id: string) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat menghapus data pembayaran.');
    }
    assertOnline();

    try {
      await deleteDoc(doc(db, 'payments', id));
      await waitForPendingWrites(db);
      setPayments((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `payments/${id}`);
    }
  }, [assertOnline]);

  const addExpense = useCallback(async (expense: Expense) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat mencatat pengeluaran.');
    }
    assertOnline();

    const cleanExpense = cleanFirestoreData(expense);
    try {
      await setDoc(doc(db, 'expenses', cleanExpense.id), cleanExpense);
      await waitForPendingWrites(db);
      setExpenses((prev) => dedupeById([...prev.filter((e) => e.id !== cleanExpense.id), cleanExpense]));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `expenses/${cleanExpense.id}`);
    }
  }, [assertOnline]);

  const deleteExpense = useCallback(async (id: string) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat menghapus pengeluaran.');
    }
    assertOnline();

    try {
      await deleteDoc(doc(db, 'expenses', id));
      await waitForPendingWrites(db);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${id}`);
    }
  }, [assertOnline]);

  const updateResident = useCallback(async (id: string, updatedData: Partial<Resident>, newPassword?: string) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat mengubah data warga.');
    }
    assertOnline();

    try {
      const firestorePayload: Record<string, any> = cleanFirestoreData({ ...updatedData });
      if (updatedData.phone === '') {
        firestorePayload.phone = deleteField();
      }
      if (updatedData.block === '') {
        firestorePayload.block = deleteField();
      }

      const resident = residentsRef.current.find((r) => r.id === id);
      const cleanName = typeof updatedData.name === 'string' ? updatedData.name.trim() : undefined;

      const batch = writeBatch(db);
      batch.update(doc(db, 'residents', id), firestorePayload);

      if (resident?.userId && (newPassword || cleanName)) {
        const userPatch: Record<string, string> = {};
        if (newPassword) {
          userPatch.password = newPassword;
          userPatch.passwordUpdatedAt = new Date().toISOString();
        }
        if (cleanName) {
          userPatch.name = cleanName;
        }
        batch.update(doc(db, 'users', resident.userId), userPatch);
      }

      await batch.commit();
      await waitForPendingWrites(db);

      setResidents((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const next: Resident = { ...r, ...cleanFirestoreData(updatedData) };
          if (updatedData.phone === '') delete next.phone;
          if (updatedData.block === '') delete next.block;
          return next;
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `residents/${id}`);
    }
  }, [assertOnline]);

  const deleteResident = useCallback(async (id: string) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat menghapus data warga.');
    }
    assertOnline();

    try {
      const [resDocSnap, residentPaymentsSnap] = await Promise.all([
        getDocFromServer(doc(db, 'residents', id)),
        getDocsFromServer(query(collection(db, 'payments'), where('residentId', '==', id))),
      ]);

      const residentData = resDocSnap.exists() ? (resDocSnap.data() as Resident) : residentsRef.current.find((r) => r.id === id);
      const refsToDelete = [
        ...(residentData?.userId ? [doc(db, 'users', residentData.userId)] : []),
        doc(db, 'residents', id),
        ...residentPaymentsSnap.docs.map((pDoc) => doc(db, 'payments', pDoc.id)),
      ];

      for (let i = 0; i < refsToDelete.length; i += 400) {
        const batch = writeBatch(db);
        for (const ref of refsToDelete.slice(i, i + 400)) {
          batch.delete(ref);
        }
        await batch.commit();
      }
      await waitForPendingWrites(db);

      setResidents((prev) => prev.filter((r) => r.id !== id));
      setPayments((prev) => prev.filter((p) => p.residentId !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `residents/${id}`);
    }
  }, [assertOnline]);

  const acknowledgeTodayReminder = useCallback(
    (uid?: string) => {
      if (!uid) return;
      setAckedReminderByUser((prev) => {
        if (prev[uid] === currentDateKey) return prev;
        const next = { ...prev, [uid]: currentDateKey };
        try {
          localStorage.setItem('grand_hannan_reminder_ack', JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
    },
    [currentDateKey]
  );

  const linkedResidentForUser = React.useMemo(
    () =>
      currentUser?.role === 'resident'
        ? residents.find((r) => r.userId === currentUser.uid || r.id === currentUser.residentId) || null
        : null,
    [currentUser?.role, currentUser?.uid, currentUser?.residentId, residents]
  );

  const visibleCloudNotifications = React.useMemo(
    () =>
      rawNotifications.filter((n) =>
        isNotificationVisibleForUser(n, currentUser, linkedResidentForUser?.id)
      ),
    [rawNotifications, currentUser, linkedResidentForUser?.id]
  );

  useEffect(() => {
    visibleCloudNotificationsRef.current = visibleCloudNotifications;
  }, [visibleCloudNotifications]);

  const notifications = React.useMemo(() => {
    if (!currentUser) return [];

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const curDay = now.getDate();
    const monthName = getMonthName(curMonth);
    const isAckedToday = ackedReminderByUser[currentUser.uid] === currentDateKey;

    let activeReminder: AppNotification | null = null;
    const summary = getResidentPaymentSummary(residents, payments, curMonth, curYear);

    if (currentUser.role === 'resident' && linkedResidentForUser) {
      const entry = summary.entries.find((e) => e.resident.id === linkedResidentForUser.id);
      const status = entry?.status || 'unpaid';
      if (status === 'unpaid' || status === 'tertunda') {
        const amountDue = entry?.payment?.amount || linkedResidentForUser.monthlyDues || 150000;
        activeReminder = {
          id: `active_unpaid_reminder_${curYear}_${curMonth}`,
          title:
            curDay === 1
              ? `Pengingat Iuran Tanggal 1 · ${monthName} ${curYear}`
              : status === 'tertunda'
              ? `Tagihan Iuran Tertunda · ${monthName} ${curYear}`
              : `Pengingat Pembayaran Iuran · ${monthName} ${curYear}`,
          message:
            status === 'tertunda'
              ? `Tagihan iuran bulan ${monthName} ${curYear} sebesar ${formatIDR(amountDue)} masih berstatus tertunda. Segera lakukan transfer dan unggah bukti pembayaran.`
              : `Tagihan iuran bulan ${monthName} ${curYear} sebesar ${formatIDR(amountDue)} belum dibayarkan. Segera transfer ke rekening paguyuban dan unggah bukti pembayaran.`,
          date: new Date(curYear, curMonth - 1, curDay, 7, 0, 0).toISOString(),
          read: isAckedToday,
          readBy: isAckedToday ? [currentUser.uid] : [],
          targetView: 'payments',
          audience: 'resident',
          recipientResidentId: linkedResidentForUser.id,
          category: 'reminder',
        };
      }
    } else if (currentUser.role === 'admin') {
      const unpaidCount = summary.notPaidYet.length;
      const pendingCount = summary.pending.length;
      if (curDay === 1 || unpaidCount > 0 || pendingCount > 0) {
        const msg =
          pendingCount > 0 && unpaidCount > 0
            ? `${unpaidCount} warga belum membayar iuran ${monthName} ${curYear} dan ${pendingCount} bukti transfer menunggu verifikasi.`
            : pendingCount > 0
            ? `${pendingCount} bukti transfer iuran bulan ${monthName} ${curYear} menunggu verifikasi Anda.`
            : unpaidCount > 0
            ? `${unpaidCount} warga belum melunasi iuran bulan ${monthName} ${curYear}.`
            : `Hari ini tanggal 1 awal bulan ${monthName} ${curYear}. Pantau pembayaran iuran warga bulan berjalan.`;

        activeReminder = {
          id: `active_admin_reminder_${curYear}_${curMonth}`,
          title:
            curDay === 1
              ? `Pengingat Iuran Awal Bulan · ${monthName} ${curYear}`
              : `Pantauan Tagihan Iuran · ${monthName} ${curYear}`,
          message: msg,
          date: new Date(curYear, curMonth - 1, curDay, 7, 0, 0).toISOString(),
          read: isAckedToday,
          readBy: isAckedToday ? [currentUser.uid] : [],
          targetView: 'payments',
          audience: 'admin',
          category: 'reminder',
        };
      }
    }

    const monthlyDocId = `reminder_iuran_${curYear}_${curMonth}`;
    const filteredCloud = activeReminder
      ? visibleCloudNotifications.filter((n) => n.id !== monthlyDocId)
      : visibleCloudNotifications;

    const combined = activeReminder ? [activeReminder, ...filteredCloud] : [...filteredCloud];
    combined.sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));
    return combined;
  }, [
    currentUser,
    residents,
    payments,
    linkedResidentForUser,
    visibleCloudNotifications,
    ackedReminderByUser,
    currentDateKey,
  ]);

  const unreadNotificationsCount = React.useMemo(
    () =>
      notifications.filter((n) => !isNotificationReadForUser(n, currentUser?.uid)).length,
    [notifications, currentUser?.uid]
  );

  const addNotification = useCallback(async (
    title: string,
    message: string,
    targetViewOrOptions?: AppNotification['targetView'] | AddNotificationOptions
  ) => {
    assertOnline();
    const opts: AddNotificationOptions =
      typeof targetViewOrOptions === 'string'
        ? { targetView: targetViewOrOptions }
        : targetViewOrOptions || {};

    const newNotif: AppNotification = cleanFirestoreData({
      id: `n_${generateId()}`,
      title,
      message,
      date: new Date().toISOString(),
      read: false,
      readBy: opts.initialReadBy ?? [],
      ...(opts.targetView ? { targetView: opts.targetView } : {}),
      ...(opts.audience ? { audience: opts.audience } : {}),
      ...(opts.recipientResidentId ? { recipientResidentId: opts.recipientResidentId } : {}),
      ...(opts.category ? { category: opts.category } : {}),
    });

    try {
      await setDoc(doc(db, 'notifications', newNotif.id), newNotif);
      await waitForPendingWrites(db);
      setRawNotifications((prev) => dedupeById([newNotif, ...prev.filter((n) => n.id !== newNotif.id)]));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `notifications/${newNotif.id}`);
    }
  }, [assertOnline]);

  const markNotificationRead = useCallback(async (id: string) => {
    const uid = currentUserRef.current?.uid;

    if (id.startsWith('active_unpaid_reminder_') || id.startsWith('active_admin_reminder_')) {
      acknowledgeTodayReminder(uid);
      if (uid && isOnlineRef.current) {
        const now = new Date();
        const monthlyDocId = `reminder_iuran_${now.getFullYear()}_${now.getMonth() + 1}`;
        const monthlyDoc = rawNotificationsRef.current.find((n) => n.id === monthlyDocId);
        if (monthlyDoc && !isNotificationReadForUser(monthlyDoc, uid)) {
          void updateDoc(doc(db, 'notifications', monthlyDocId), {
            readBy: arrayUnion(uid),
          }).catch(() => {});
          setRawNotifications((prev) =>
            prev.map((n) =>
              n.id === monthlyDocId
                ? { ...n, readBy: Array.from(new Set([...(n.readBy || []), uid])) }
                : n
            )
          );
        }
      }
      return;
    }

    assertOnline();
    try {
      if (uid) {
        await updateDoc(doc(db, 'notifications', id), { readBy: arrayUnion(uid) });
      } else {
        await updateDoc(doc(db, 'notifications', id), { read: true });
      }
      await waitForPendingWrites(db);
      setRawNotifications((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          if (uid) {
            return { ...n, readBy: Array.from(new Set([...(n.readBy || []), uid])) };
          }
          return { ...n, read: true };
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  }, [acknowledgeTodayReminder, assertOnline]);

  const markAllNotificationsRead = useCallback(async () => {
    const uid = currentUserRef.current?.uid;
    acknowledgeTodayReminder(uid);

    const now = new Date();
    const monthlyDocId = `reminder_iuran_${now.getFullYear()}_${now.getMonth() + 1}`;
    const unreadItems = visibleCloudNotificationsRef.current.filter(
      (n) => !isNotificationReadForUser(n, uid)
    );
    const monthlyDoc = rawNotificationsRef.current.find((n) => n.id === monthlyDocId);
    if (
      monthlyDoc &&
      !isNotificationReadForUser(monthlyDoc, uid) &&
      !unreadItems.some((n) => n.id === monthlyDocId)
    ) {
      unreadItems.push(monthlyDoc);
    }

    if (unreadItems.length === 0) return;
    assertOnline();

    try {
      for (let i = 0; i < unreadItems.length; i += 400) {
        const batch = writeBatch(db);
        for (const item of unreadItems.slice(i, i + 400)) {
          batch.update(
            doc(db, 'notifications', item.id),
            uid ? { readBy: arrayUnion(uid) } : { read: true }
          );
        }
        await batch.commit();
      }
      await waitForPendingWrites(db);
      const unreadIds = new Set(unreadItems.map((n) => n.id));
      setRawNotifications((prev) =>
        prev.map((n) => {
          if (!unreadIds.has(n.id)) return n;
          if (uid) {
            return { ...n, readBy: Array.from(new Set([...(n.readBy || []), uid])) };
          }
          return { ...n, read: true };
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications');
    }
  }, [acknowledgeTodayReminder, assertOnline]);

  const updateBankAccount = useCallback(async (newBankAccount: BankAccount) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat mengubah rekening pembayaran.');
    }
    assertOnline();

    try {
      await setDoc(doc(db, 'settings', 'bankAccount'), newBankAccount);
      await waitForPendingWrites(db);
      setBankAccount(newBankAccount);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/bankAccount');
    }
  }, [assertOnline]);

  const updateOrganizationContacts = useCallback(async (contacts: OrganizationContact[]) => {
    if (currentUserRef.current?.role !== 'admin') {
      throw new Error('Hanya Admin yang dapat mengatur kontak penanggung jawab.');
    }
    assertOnline();

    const cleanContacts: OrganizationContact[] = contacts.map((item) =>
      cleanFirestoreData({
        id: item.id,
        name: item.name.trim(),
        roleTitle: item.roleTitle.trim(),
        whatsapp: item.whatsapp.trim(),
      })
    );

    try {
      await setDoc(doc(db, 'settings', 'organization'), {
        contacts: cleanContacts,
        updatedAt: new Date().toISOString(),
      });
      await waitForPendingWrites(db);
      setOrganizationContacts(cleanContacts);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/organization');
    }
  }, [assertOnline]);

  const updateProfilePhoto = useCallback(async (photoUrl: string | null) => {
    const activeUser = currentUserRef.current;
    if (!activeUser) {
      throw new Error('Sesi pengguna tidak ditemukan.');
    }
    assertOnline();

    try {
      const batch = writeBatch(db);
      let resolvedResidentId: string | undefined;

      if (activeUser.role === 'admin') {
        batch.set(
          doc(db, 'users', activeUser.uid),
          {
            uid: activeUser.uid,
            email: activeUser.email || 'admin',
            name: activeUser.name || 'Admin Paguyuban',
            role: 'admin',
            photoUrl: photoUrl ? photoUrl : deleteField(),
          },
          { merge: true }
        );
      } else {
        const currentResidents = residentsRef.current;
        let linkedResident = currentResidents.find(
          (r) => r.userId === activeUser.uid || r.id === activeUser.residentId
        );

        if (!linkedResident) {
          const userSnap = await getDocFromServer(doc(db, 'users', activeUser.uid)).catch(() => null);
          const serverResidentId = userSnap?.exists()
            ? (userSnap.data()?.residentId as string | undefined)
            : undefined;
          if (serverResidentId) {
            linkedResident = currentResidents.find((r) => r.id === serverResidentId);
            resolvedResidentId = serverResidentId;
          }
        }

        if (!linkedResident && !resolvedResidentId) {
          const resQuerySnap = await getDocsFromServer(
            query(collection(db, 'residents'), where('userId', '==', activeUser.uid))
          ).catch(() => null);
          if (resQuerySnap && !resQuerySnap.empty) {
            resolvedResidentId = resQuerySnap.docs[0].id;
          }
        }

        resolvedResidentId = linkedResident?.id || resolvedResidentId || activeUser.residentId;

        batch.set(
          doc(db, 'users', activeUser.uid),
          {
            photoUrl: photoUrl ? photoUrl : deleteField(),
            ...(resolvedResidentId ? { residentId: resolvedResidentId } : {}),
          },
          { merge: true }
        );

        if (resolvedResidentId) {
          batch.set(
            doc(db, 'residents', resolvedResidentId),
            {
              photoUrl: photoUrl ? photoUrl : deleteField(),
              userId: activeUser.uid,
            },
            { merge: true }
          );
        }
      }

      await batch.commit();
      await waitForPendingWrites(db);

      if (activeUser.role !== 'admin') {
        if (resolvedResidentId) {
          setResidents((prev) =>
            prev.map((r) => {
              if (r.id !== resolvedResidentId) return r;
              const next = { ...r, userId: activeUser.uid };
              if (photoUrl) {
                next.photoUrl = photoUrl;
              } else {
                delete next.photoUrl;
              }
              return next;
            })
          );
        }
        setUserPhotoMap((prev) => {
          const nextByUid = { ...prev.byUid };
          const nextByResident = { ...prev.byResidentId };
          if (photoUrl) {
            nextByUid[activeUser.uid] = photoUrl;
            if (resolvedResidentId) nextByResident[resolvedResidentId] = photoUrl;
          } else {
            delete nextByUid[activeUser.uid];
            if (resolvedResidentId) delete nextByResident[resolvedResidentId];
          }
          return { byUid: nextByUid, byResidentId: nextByResident };
        });
      }

      setCurrentUser((prev) => {
        if (!prev) return prev;
        const next: AppUser = {
          ...prev,
          ...(resolvedResidentId ? { residentId: resolvedResidentId } : {}),
        };
        if (photoUrl) {
          next.photoUrl = photoUrl;
        } else {
          delete next.photoUrl;
        }
        persistSession(next);
        return next;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${activeUser.uid}`);
    }
  }, [assertOnline, persistSession]);

  const updateOwnPassword = useCallback(async (newPassword: string) => {
    const activeUser = currentUserRef.current;
    if (!activeUser) {
      throw new Error('Sesi pengguna tidak ditemukan.');
    }
    if (newPassword.length < 6) {
      throw new Error('Password minimal 6 karakter.');
    }
    assertOnline();

    const updatedAt = new Date().toISOString();
    try {
      // Mark locally before committing so this device stays signed in while other devices log out
      localPasswordUpdateAtRef.current = updatedAt;

      if (activeUser.role === 'admin') {
        await setDoc(
          doc(db, 'users', 'admin_uid'),
          {
            uid: 'admin_uid',
            email: 'admin',
            name: activeUser.name || 'Admin Paguyuban',
            password: newPassword,
            passwordUpdatedAt: updatedAt,
            role: 'admin',
          },
          { merge: true }
        );
      } else if (activeUser.uid) {
        await updateDoc(doc(db, 'users', activeUser.uid), {
          password: newPassword,
          passwordUpdatedAt: updatedAt,
        });
      }

      await waitForPendingWrites(db);

      if (auth.currentUser) {
        try {
          await updatePassword(auth.currentUser, newPassword);
        } catch {
          // Firebase Auth fallback when using custom Firestore accounts
        }
      }

      setCurrentUser((prev) => {
        if (!prev) return prev;
        const next: AppUser = { ...prev, passwordUpdatedAt: updatedAt };
        persistSession(next);
        return next;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${activeUser.uid}`);
    }
  }, [assertOnline, persistSession]);

  const contextValue = useMemo<AppContextType>(
    () => ({
      currentUser,
      isLoadingAuth,
      isOnline,
      syncMode,
      isHydratingCloud,
      isRefreshingCloud,
      hasCloudHydrated,
      cloudSyncError,
      cloudSyncErrorDetail,
      authNotice,
      clearAuthNotice,
      retryCloudSync,
      refreshCloudNow,
      signInUser,
      residents,
      syncingResidentName,
      hasPendingResidentSync,
      payments,
      notifications,
      unreadNotificationsCount,
      expenses,
      addResident,
      updateResident,
      deleteResident,
      addPayment,
      updatePayment,
      deletePayment,
      addExpense,
      deleteExpense,
      signOutUser,
      addNotification,
      markNotificationRead,
      markAllNotificationsRead,
      bankAccount,
      updateBankAccount,
      organizationContacts,
      updateOrganizationContacts,
      updateProfilePhoto,
      updateOwnPassword,
    }),
    [
      currentUser,
      isLoadingAuth,
      isOnline,
      syncMode,
      isHydratingCloud,
      isRefreshingCloud,
      hasCloudHydrated,
      cloudSyncError,
      cloudSyncErrorDetail,
      authNotice,
      clearAuthNotice,
      retryCloudSync,
      refreshCloudNow,
      signInUser,
      residents,
      syncingResidentName,
      hasPendingResidentSync,
      payments,
      notifications,
      unreadNotificationsCount,
      expenses,
      addResident,
      updateResident,
      deleteResident,
      addPayment,
      updatePayment,
      deletePayment,
      addExpense,
      deleteExpense,
      signOutUser,
      addNotification,
      markNotificationRead,
      markAllNotificationsRead,
      bankAccount,
      updateBankAccount,
      organizationContacts,
      updateOrganizationContacts,
      updateProfilePhoto,
      updateOwnPassword,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
