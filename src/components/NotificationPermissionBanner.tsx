import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BellRing, CheckCircle2, Info, Smartphone, X } from 'lucide-react';
import { Resident, Payment } from '../types';
import { Icon3D } from './Icon3D';
import {
  registerMonthlyPeriodicSync,
  showSmartphoneNotification,
  syncResidentAndCheckMonthlyDue,
} from '../utils/monthlyNotifications';

interface NotificationPermissionBannerProps {
  userId: string;
  resident: Resident;
  payments: Payment[];
}

export const NotificationPermissionBanner: React.FC<NotificationPermissionBannerProps> = ({
  userId,
  resident,
  payments,
}) => {
  const dismissKey = `notif_banner_dismissed_${userId}`;
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    isSupported ? Notification.permission : 'unsupported'
  );
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(dismissKey) === '1';
    } catch {
      return false;
    }
  });
  const [isRequesting, setIsRequesting] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  const isIOSBrowserNotInstalled = (() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return isIOS && !isStandalone && !isSupported;
  })();

  useEffect(() => {
    try {
      setIsDismissed(sessionStorage.getItem(dismissKey) === '1');
    } catch {
      setIsDismissed(false);
    }
  }, [dismissKey]);

  useEffect(() => {
    if (!isSupported) return;
    const syncPermission = () => setPermission(Notification.permission);
    syncPermission();
    document.addEventListener('visibilitychange', syncPermission);
    return () => document.removeEventListener('visibilitychange', syncPermission);
  }, [isSupported]);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(dismissKey, '1');
    } catch {
      // Ignore storage errors
    }
  };

  const handleEnableNotifications = async () => {
    if (!isSupported || isRequesting) return;
    setIsRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        await registerMonthlyPeriodicSync();
        const sentDueNow = await syncResidentAndCheckMonthlyDue(resident, payments);
        if (!sentDueNow) {
          await showSmartphoneNotification('Pengingat Iuran Tanggal 1 Aktif', {
            body: 'Notifikasi otomatis akan masuk ke bilah notifikasi HP Anda setiap tanggal 1 awal bulan.',
            tag: 'grand-hannan-notif-enabled',
          });
        }
        setJustEnabled(true);
        setTimeout(() => {
          setJustEnabled(false);
        }, 4500);
      }
    } finally {
      setIsRequesting(false);
    }
  };

  if (isDismissed) return null;
  if (permission === 'granted' && !justEnabled) return null;
  if (permission === 'unsupported' && !isIOSBrowserNotInstalled) return null;

  return (
    <AnimatePresence>
      {justEnabled ? (
        <motion.section
          key="notif-enabled-banner"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          className="bg-emerald-50/95 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/50 rounded-3xl p-4 sm:p-5 shadow-xs transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Icon3D icon={CheckCircle2} size="md" variant="emerald" />
              <div className="min-w-0">
                <p className="font-display font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Notifikasi Tanggal 1 Aktif
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Pengingat iuran bulanan akan otomatis muncul di bilah notifikasi HP Anda setiap tanggal 1.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setJustEnabled(false)}
              aria-label="Tutup pemberitahuan"
              className="icon-btn-md text-emerald-800/75 dark:text-emerald-200/75 hover:bg-emerald-200/50 dark:hover:bg-emerald-900/50"
            >
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </motion.section>
      ) : isIOSBrowserNotInstalled ? (
        <motion.section
          key="notif-ios-guide-banner"
          role="status"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          className="bg-[#edf6fe]/95 dark:bg-[#152843]/90 border border-blue-200/80 dark:border-blue-500/30 rounded-3xl p-4 sm:p-5 shadow-xs transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <Icon3D icon={Smartphone} size="lg" variant="blue" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#0070e0] dark:text-[#60b5ff]">
                  Notifikasi Tanggal 1 · Pengguna iPhone / iPad
                </p>
                <h2 className="font-display font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base mt-0.5">
                  Pasang ke Layar Utama untuk Aktifkan Notifikasi HP
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  Ketuk tombol <strong>Bagikan (Share)</strong> di Safari lalu pilih{' '}
                  <strong>Tambahkan ke Layar Utama</strong> agar pengingat iuran tanggal 1 dapat masuk ke notifikasi iPhone Anda.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Tutup banner"
              className="icon-btn-md -mr-1 -mt-1 text-slate-500 dark:text-slate-400 hover:bg-blue-100/70 dark:hover:bg-[#1e3554]"
            >
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </motion.section>
      ) : permission === 'denied' ? (
        <motion.section
          key="notif-denied-banner"
          role="status"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          className="bg-slate-50/95 dark:bg-[#162339]/90 border border-slate-200 dark:border-slate-700/80 rounded-3xl p-4 sm:p-5 shadow-xs transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Icon3D icon={Info} size="md" variant="slate" />
              <div className="min-w-0">
                <p className="font-display font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Izin Notifikasi HP Masih Diblokir
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                  Untuk menerima pengingat iuran otomatis tiap tanggal 1 di bilah notifikasi, izinkan notifikasi melalui pengaturan situs di browser Anda.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Tutup banner"
              className="icon-btn-md -mr-1 -mt-1 text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#233554]"
            >
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </motion.section>
      ) : (
        <motion.section
          key="notif-request-banner"
          role="region"
          aria-label="Aktifkan notifikasi pengingat tanggal 1"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          className="bg-[#edf6fe]/95 dark:bg-[#152843]/90 border border-blue-200/90 dark:border-blue-500/35 rounded-3xl p-4 sm:p-5 shadow-xs transition-colors"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <Icon3D icon={BellRing} size="lg" variant="blue" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[#0070e0] dark:text-[#60b5ff]">
                    Pengingat Otomatis · Setiap Tanggal 1
                  </p>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="Nanti saja"
                    className="sm:hidden icon-btn-md -mr-1 -mt-1 text-slate-500 dark:text-slate-400 hover:bg-blue-100/80 dark:hover:bg-[#1e3554]"
                  >
                    <X className="w-4 h-4 stroke-[2]" />
                  </button>
                </div>
                <h2 className="font-display font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base mt-0.5">
                  Aktifkan Notifikasi Pengingat Iuran di HP
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  Terima pengingat otomatis langsung di bilah notifikasi smartphone setiap tanggal 1 awal bulan saat tagihan iuran tersedia.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDismiss}
                className="hidden sm:inline-flex items-center justify-center px-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-blue-100/70 dark:hover:bg-[#1e3554] transition-colors cursor-pointer min-h-[44px]"
              >
                Nanti Saja
              </button>
              <button
                type="button"
                disabled={isRequesting}
                onClick={handleEnableNotifications}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap shadow-sm shadow-blue-500/20 disabled:opacity-60"
              >
                <BellRing className="w-4 h-4 icon-3d-glyph" />
                <span>{isRequesting ? 'Meminta Izin...' : 'Aktifkan Notifikasi'}</span>
              </button>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
};
