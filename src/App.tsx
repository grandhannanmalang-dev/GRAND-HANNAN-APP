import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import { AppProvider, useAppContext } from './AppContext';
import { ThemeProvider } from './ThemeContext';
import { Sidebar, ViewType } from './components/Sidebar';
import { Header } from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';

const loadLogin = () => import('./components/Login');
const loadDashboard = () => import('./components/Dashboard');
const loadResidentDashboard = () => import('./components/ResidentDashboard');
const loadResidents = () => import('./components/Residents');
const loadPayments = () => import('./components/Payments');
const loadReports = () => import('./components/Reports');
const loadSettings = () => import('./components/Settings');

const Login = lazy(() => loadLogin().then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => loadDashboard().then((m) => ({ default: m.Dashboard })));
const ResidentDashboard = lazy(() =>
  loadResidentDashboard().then((m) => ({ default: m.ResidentDashboard }))
);
const Residents = lazy(() => loadResidents().then((m) => ({ default: m.Residents })));
const Payments = lazy(() => loadPayments().then((m) => ({ default: m.Payments })));
const Reports = lazy(() => loadReports().then((m) => ({ default: m.Reports })));
const Settings = lazy(() => loadSettings().then((m) => ({ default: m.Settings })));
import {
  Home,
  Users,
  CreditCard,
  BarChart3,
  Settings as SettingsIcon,
  WifiOff,
  RefreshCw,
  LogOut,
  Cloud
} from 'lucide-react';

const VALID_VIEWS: ViewType[] = ['dashboard', 'residents', 'payments', 'reports', 'settings'];

const FADE_EASE = [0.16, 1, 0.3, 1] as const;

const prefetchViewChunk = (view: ViewType, role?: 'admin' | 'resident') => {
  switch (view) {
    case 'dashboard':
      void loadDashboard();
      break;
    case 'residents':
      void loadResidents();
      break;
    case 'payments':
      if (role === 'resident') {
        void loadResidentDashboard();
      } else {
        void loadPayments();
      }
      break;
    case 'reports':
      void loadReports();
      break;
    case 'settings':
      void loadSettings();
      break;
  }
};

const PageLoaderFallback: React.FC = () => (
  <div className="min-h-[260px] w-full flex items-center justify-center py-12">
    <div className="flex flex-col items-center gap-2.5">
      <div className="w-8 h-8 border-3 border-[#0088f8] border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Memuat tampilan...</span>
    </div>
  </div>
);

function getInitialViewFromUrl(): ViewType {
  if (typeof window === 'undefined') return 'dashboard';
  const param = new URLSearchParams(window.location.search).get('view') as ViewType | null;
  if (param && VALID_VIEWS.includes(param)) {
    return param;
  }
  return 'dashboard';
}

function MainApp() {
  const {
    currentUser,
    isLoadingAuth,
    isOnline,
    syncMode,
    isHydratingCloud,
    isRefreshingCloud,
    hasCloudHydrated,
    cloudSyncError,
    cloudSyncErrorDetail,
    retryCloudSync,
    refreshCloudNow,
    signOutUser,
    payments
  } = useAppContext();
  const [currentView, setCurrentView] = useState<ViewType>(getInitialViewFromUrl);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const prevUserUidRef = useRef<string | null>(currentUser?.uid ?? null);
  const shouldReduceMotion = useReducedMotion();

  const handleChangeView = useCallback((nextView: ViewType) => {
    setCurrentView((prev) => (prev === nextView ? prev : nextView));
  }, []);

  const handlePrefetchView = useCallback(
    (view: ViewType) => {
      prefetchViewChunk(view, currentUser?.role);
    },
    [currentUser?.role]
  );

  useEffect(() => {
    if (!currentUser || !hasCloudHydrated || typeof window === 'undefined') return;
    const warmAllViews = () => {
      prefetchViewChunk('dashboard', currentUser.role);
      prefetchViewChunk('residents', currentUser.role);
      prefetchViewChunk('payments', currentUser.role);
      prefetchViewChunk('reports', currentUser.role);
      prefetchViewChunk('settings', currentUser.role);
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(warmAllViews, { timeout: 1500 });
      return () => win.cancelIdleCallback?.(idleId);
    }

    const timerId = window.setTimeout(warmAllViews, 700);
    return () => window.clearTimeout(timerId);
  }, [currentUser, hasCloudHydrated]);

  useEffect(() => {
    const nextUid = currentUser?.uid ?? null;
    if (prevUserUidRef.current !== nextUid) {
      prevUserUidRef.current = nextUid;
      setCurrentView('dashboard');
      setIsSidebarOpen(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentView]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent<{ type?: string; view?: ViewType }>) => {
      if (event.data?.type === 'OPEN_VIEW' && event.data.view && VALID_VIEWS.includes(event.data.view)) {
        handleChangeView(event.data.view);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [handleChangeView]);

  const pendingCount = useMemo(
    () => payments.filter((p) => p.status === 'pending' || p.status === 'tertunda').length,
    [payments]
  );

  if (isLoadingAuth) {
    return (
      <div className="min-h-dvh w-full bg-[#edf5fc] dark:bg-[#0b1220] flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#0088f8] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Memuat Grand Hannan...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Suspense
        fallback={
          <div className="min-h-dvh w-full bg-[#edf5fc] dark:bg-[#0b1220] flex items-center justify-center transition-colors">
            <div className="w-10 h-10 border-4 border-[#0088f8] border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <Login />
      </Suspense>
    );
  }

  if (!hasCloudHydrated && isHydratingCloud) {
    return (
      <div className="min-h-dvh w-full bg-[#edf5fc] dark:bg-[#0b1220] flex items-center justify-center px-6 transition-colors">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 border-4 border-[#0088f8] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Menyinkronkan data terbaru dari cloud...
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Memastikan seluruh data warga dan iuran sama di semua perangkat
          </p>
        </div>
      </div>
    );
  }

  if (!hasCloudHydrated && cloudSyncError) {
    return (
      <div className="min-h-dvh w-full bg-[#edf5fc] dark:bg-[#0b1220] flex items-center justify-center px-5 py-8 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-[#111c2e] border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 text-center shadow-lg space-y-4">
          <div className="w-12 h-12 aspect-square mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <WifiOff className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Koneksi Cloud Diperlukan
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {cloudSyncError}
            </p>
          </div>

          {cloudSyncErrorDetail && (
            <div className="text-left bg-slate-50 dark:bg-[#0b1322] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Detail Error
              </p>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300 break-words leading-relaxed">
                {cloudSyncErrorDetail}
              </p>
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={retryCloudSync}
              disabled={isHydratingCloud}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-70"
            >
              <RefreshCw className={`w-4 h-4 ${isHydratingCloud ? 'animate-spin' : ''}`} />
              <span>{isHydratingCloud ? 'Menghubungkan...' : 'Coba Hubungkan Lagi'}</span>
            </button>

            <button
              type="button"
              onClick={() => void signOutUser()}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar ke Halaman Login</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            onNavigateToPayments={() => handleChangeView('payments')}
            onChangeView={handleChangeView}
          />
        );
      case 'residents':
        return <Residents />;
      case 'payments':
        return currentUser.role === 'admin' ? <Payments /> : <ResidentDashboard />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return (
          <Dashboard
            onNavigateToPayments={() => handleChangeView('payments')}
            onChangeView={handleChangeView}
          />
        );
    }
  };

  return (
    <div className="flex h-dvh w-full max-w-full bg-[#edf5fc] dark:bg-[#0b1220] overflow-hidden font-sans text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar
        currentView={currentView}
        onChangeView={handleChangeView}
        onPrefetchView={handlePrefetchView}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header onChangeView={handleChangeView} />

        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-3.5 sm:px-6 lg:px-8 py-4 sm:py-5 pb-[calc(6.25rem+env(safe-area-inset-bottom))] lg:pb-8"
        >
          <div className="max-w-5xl mx-auto w-full min-w-0 space-y-4">
            {!isOnline && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/50 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-medium"
              >
                <WifiOff className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>
                  Koneksi internet terputus · Perubahan data dinonaktifkan sementara hingga perangkat kembali online agar semua perangkat tetap sama.
                </span>
              </div>
            )}

            {isOnline && syncMode === 'polling' && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800/60 text-blue-900 dark:text-blue-200 text-xs sm:text-sm font-medium"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Cloud className="w-4 h-4 shrink-0 text-[#0088f8] dark:text-[#60b5ff]" />
                  <span>
                    Mode sinkronisasi HTTPS langsung aktif · Data diperbarui otomatis tiap 10 detik.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshCloudNow()}
                  disabled={isRefreshingCloud}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white dark:bg-[#111c2e] border border-blue-200 dark:border-blue-700 text-[#0088f8] dark:text-[#60b5ff] text-xs font-bold hover:bg-blue-100/60 dark:hover:bg-blue-900/40 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCloud ? 'animate-spin' : ''}`} />
                  <span>{isRefreshingCloud ? 'Menyegarkan...' : 'Segarkan'}</span>
                </button>
              </div>
            )}

            <ErrorBoundary
              resetKey={currentView}
              onGoHome={() => handleChangeView('dashboard')}
            >
              <motion.div
                key={currentView}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: shouldReduceMotion ? 0.08 : 0.25,
                  ease: FADE_EASE,
                }}
                className="w-full"
              >
                <Suspense fallback={<PageLoaderFallback />}>
                  {renderView()}
                </Suspense>
              </motion.div>
            </ErrorBoundary>
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 pb-[env(safe-area-inset-bottom)] bg-white/80 dark:bg-[#0d1728]/80 backdrop-blur-xl border-t border-slate-200/70 dark:border-slate-700/70 transition-colors">
          <div className="mobile-nav-grid">
            {(
              [
                {
                  id: 'dashboard' as ViewType,
                  label: 'Beranda',
                  icon: Home,
                  colorClass: 'btn-3d-violet',
                  ringClass: 'ring-violet-500/70',
                  badge: 0,
                  title: 'Beranda',
                },
                {
                  id: 'residents' as ViewType,
                  label: 'Warga',
                  icon: Users,
                  colorClass: 'btn-3d-emerald',
                  ringClass: 'ring-emerald-500/70',
                  badge: 0,
                  title: 'Data Warga',
                },
                {
                  id: 'payments' as ViewType,
                  label: currentUser.role === 'admin' ? 'Iuran' : 'Bayar',
                  icon: CreditCard,
                  colorClass: 'btn-3d-floating',
                  ringClass: 'ring-[#0088f8]/75',
                  badge: currentUser.role === 'admin' ? pendingCount : 0,
                  title: currentUser.role === 'admin' ? 'Kelola Pembayaran Iuran' : 'Bayar Iuran',
                },
                {
                  id: 'reports' as ViewType,
                  label: 'Laporan',
                  icon: BarChart3,
                  colorClass: 'btn-3d-amber',
                  ringClass: 'ring-orange-500/70',
                  badge: 0,
                  title: 'Laporan Keuangan',
                },
                {
                  id: 'settings' as ViewType,
                  label: 'Pengaturan',
                  icon: SettingsIcon,
                  colorClass: 'btn-3d-slate',
                  ringClass: 'ring-slate-500/70 dark:ring-slate-400/70',
                  badge: 0,
                  title: 'Pengaturan',
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => handlePrefetchView(item.id)}
                  onFocus={() => handlePrefetchView(item.id)}
                  onClick={() => handleChangeView(item.id)}
                  title={item.title}
                  aria-current={isActive ? 'page' : undefined}
                  className={`mobile-nav-item ${item.colorClass} ${
                    isActive
                      ? `ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#111c2e] ${item.ringClass} -translate-y-0.5`
                      : 'opacity-90 hover:opacity-100'
                  }`}
                >
                  <div className="relative z-10 w-6 h-6 flex items-center justify-center">
                    <Icon className="w-6 h-6 stroke-[2]" />
                    {item.badge > 0 && (
                      <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 bg-[#ff3b30] text-white text-[10px] font-bold rounded-md flex items-center justify-center ring-2 ring-white dark:ring-[#111c2e] tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="relative z-10 font-display text-[10.5px] font-bold tracking-tight text-white whitespace-nowrap leading-none">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary title="Aplikasi Mengalami Kendala">
        <ThemeProvider>
          <AppProvider>
            <MainApp />
          </AppProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </MotionConfig>
  );
}
