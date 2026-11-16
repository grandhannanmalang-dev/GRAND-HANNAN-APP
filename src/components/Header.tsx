import React, { useState, useRef, useEffect } from 'react';
import { LogOut, Bell, ShieldCheck, Camera, Trash2, X, AlertTriangle, Loader2, Sun, Moon, Monitor, Check, CheckCheck, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useAppContext } from '../AppContext';
import { useTheme, ThemeMode } from '../ThemeContext';
import { compressImage, getInitials, isNotificationReadForUser, resolveNotificationTarget, safeTimeMs, translateErrorToIndonesian } from '../utils';
import { AppNotification } from '../types';
import { ViewType } from './Sidebar';
import { Icon3D } from './Icon3D';

interface HeaderProps {
  onChangeView?: (view: ViewType) => void;
}

export const Header: React.FC<HeaderProps> = ({ onChangeView }) => {
  const {
    currentUser,
    signOutUser,
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
    isOnline,
    residents,
    updateProfilePhoto,
  } = useAppContext();
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [notifActionError, setNotifActionError] = useState('');
  const notificationRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const currentResident = currentUser?.role === 'resident'
    ? residents.find(r => r.userId === currentUser?.uid || r.id === currentUser?.residentId)
    : null;

  const displayName = currentUser?.role === 'admin'
    ? (currentUser.name || 'Admin Paguyuban')
    : (currentResident?.name || currentUser?.name || currentUser?.email || 'Warga Grand Hannan');

  const subtitleInfo = currentResident
    ? `${currentResident.propertyType}${currentResident.block ? ` Blok ${currentResident.block}` : ''} No. ${currentResident.houseNumber}`
    : (currentUser?.role === 'admin' ? 'Pengurus Paguyuban Grand Hannan' : 'Warga Grand Hannan');

  const profilePhoto = currentUser?.photoUrl || currentResident?.photoUrl;
  const unreadCount = unreadNotificationsCount;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setShowThemeMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowThemeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const themeOptions: { mode: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
    { mode: 'light', label: 'Terang', desc: 'Tampilan cerah standar', icon: Sun },
    { mode: 'dark', label: 'Gelap', desc: 'Biru malam lembut', icon: Moon },
    {
      mode: 'system',
      label: 'Ikuti Sistem',
      desc: `Otomatis (${resolvedTheme === 'dark' ? 'Gelap' : 'Terang'})`,
      icon: Monitor,
    },
  ];

  const ActiveThemeIcon = themeMode === 'light' ? Sun : themeMode === 'dark' ? Moon : Monitor;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Ukuran foto maksimal 5MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setPhotoError('');
    setIsUpdatingPhoto(true);
    try {
      const compressed = await compressImage(file, 400, 0.8);
      await updateProfilePhoto(compressed);
      setShowPhotoModal(false);
    } catch (err: unknown) {
      setPhotoError(translateErrorToIndonesian(err, 'Gagal mengunggah foto profil.'));
    } finally {
      setIsUpdatingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoError('');
    setIsUpdatingPhoto(true);
    try {
      await updateProfilePhoto(null);
      setShowPhotoModal(false);
    } catch (err: unknown) {
      setPhotoError(translateErrorToIndonesian(err, 'Gagal menghapus foto profil.'));
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || isMarkingAllRead) return;
    setNotifActionError('');
    setIsMarkingAllRead(true);
    try {
      await markAllNotificationsRead();
    } catch (err: unknown) {
      setNotifActionError(
        translateErrorToIndonesian(err, 'Gagal menandai semua notifikasi sebagai dibaca.')
      );
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    const target = resolveNotificationTarget(notif, currentUser?.role);
    if (!isNotificationReadForUser(notif, currentUser?.uid)) {
      void markNotificationRead(notif.id).catch(() => {});
    }
    setShowNotifications(false);
    onChangeView?.(target.view);
  };

  return (
    <>
      <header className="bg-gradient-to-br from-[#0052b4] via-[#007ae5] to-[#26a4ff] dark:from-[#060f1f] dark:via-[#0b1b36] dark:to-[#0f2b52] dark:border-b dark:border-slate-800/90 text-white pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 px-4 sm:px-6 lg:px-8 relative z-40 shadow-sm shrink-0 transition-colors">
        {/* Decorative Background Layers matching Login visual identity */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* Layer 1: Subtle directional radial sheen */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.22),transparent_58%),radial-gradient(ellipse_at_bottom_right,rgba(0,48,120,0.32),transparent_62%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(38,164,255,0.16),transparent_58%),radial-gradient(ellipse_at_bottom_right,rgba(4,10,20,0.65),transparent_62%)]" />

          {/* Layer 2: Lightweight layered translucent SVG waves */}
          <svg
            viewBox="0 0 1440 160"
            preserveAspectRatio="none"
            className="absolute inset-x-0 bottom-0 w-full h-full"
          >
            <path
              d="M0,78 C260,26 520,118 820,66 C1080,22 1280,58 1440,84 L1440,160 L0,160 Z"
              className="fill-white/10 dark:fill-[#60b5ff]/[0.06]"
            />
          </svg>
          <svg
            viewBox="0 0 1440 140"
            preserveAspectRatio="none"
            className="absolute inset-x-0 bottom-0 w-full h-[82%]"
          >
            <path
              d="M0,56 C320,108 600,24 920,72 C1160,106 1320,48 1440,66 L1440,140 L0,140 Z"
              className="fill-[#bae6fd]/18 dark:fill-[#0088f8]/[0.09]"
            />
          </svg>
          <svg
            viewBox="0 0 1440 110"
            preserveAspectRatio="none"
            className="absolute inset-x-0 bottom-0 w-full h-[64%]"
          >
            <path
              d="M0,58 C300,24 580,88 880,48 C1130,18 1300,58 1440,42 L1440,110 L0,110 Z"
              className="fill-white/14 dark:fill-[#060d1a]/50"
            />
          </svg>
        </div>

        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 relative z-10">
          {/* Left: Clickable Profile Photo & Full Account Name */}
          <button
            type="button"
            onClick={() => {
              setPhotoError('');
              setShowPhotoModal(true);
            }}
            className="flex items-center gap-3 min-w-0 text-left group cursor-pointer rounded-2xl py-1 pr-2 hover:bg-[#004ca8]/30 dark:hover:bg-[#122645]/60 transition-colors"
            title="Ubah Foto Profil"
          >
            <div className="relative w-11 h-11 aspect-square rounded-2xl bg-[#004ca8]/70 dark:bg-[#122645]/75 backdrop-blur-md border border-white/35 dark:border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.42),inset_0_-2px_0_rgba(0,30,80,0.34),0_4px_12px_-2px_rgba(0,36,92,0.28)] flex items-center justify-center text-white font-display font-bold text-sm shrink-0 overflow-visible">
              <div className="w-full h-full rounded-2xl overflow-hidden flex items-center justify-center">
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : currentUser?.role === 'admin' ? (
                  <ShieldCheck className="w-6 h-6 text-white stroke-[2]" />
                ) : (
                  <span>{getInitials(displayName)}</span>
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 aspect-square rounded-lg bg-white/90 dark:bg-[#1e3557]/90 backdrop-blur-md text-[#004ca8] dark:text-[#60b5ff] border border-white/60 dark:border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_2px_4px_rgba(15,23,42,0.18)] flex items-center justify-center ring-2 ring-[#004ca8]/80 dark:ring-[#122645]/80 group-hover:scale-105 transition-transform">
                <Camera className="w-3.5 h-3.5 stroke-[2]" />
              </span>
            </div>

            <div className="min-w-0">
              <h2 className="font-display font-bold text-white text-base sm:text-lg leading-snug tracking-tight truncate">
                {displayName}
              </h2>
              <p className="text-xs font-medium text-blue-100 dark:text-slate-300 truncate">
                {subtitleInfo}
              </p>
            </div>
          </button>

          {/* Right: iOS Liquid Glass 3D Action Buttons (Theme, Notification & Logout) */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Theme Switcher */}
            <div className="relative" ref={themeMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setShowThemeMenu((prev) => !prev);
                  setShowNotifications(false);
                }}
                className="icon-btn-lg btn-3d-violet text-white relative overflow-hidden"
                title="Ubah Tampilan Tema"
                aria-label="Ubah Tampilan Tema"
                aria-expanded={showThemeMenu}
                aria-haspopup="menu"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={themeMode}
                    initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.82 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.82 }}
                    transition={{ duration: shouldReduceMotion ? 0.06 : 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-10 flex items-center justify-center"
                  >
                    <ActiveThemeIcon className="w-6 h-6 stroke-[2]" />
                  </motion.span>
                </AnimatePresence>
              </button>

              <AnimatePresence>
                {showThemeMenu && (
                  <motion.div
                    role="menu"
                    aria-label="Pilih mode tampilan"
                    initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.97 }}
                    transition={{ duration: shouldReduceMotion ? 0.08 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed left-4 right-4 top-[4.8rem] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-64 origin-top sm:origin-top-right bg-white dark:bg-[#111c2e] rounded-3xl shadow-2xl shadow-blue-900/20 dark:shadow-black/60 border border-slate-200 dark:border-slate-800 z-[100] overflow-hidden text-slate-900 dark:text-slate-100"
                  >
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-[#edf6fe] dark:bg-[#18263d]">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Tampilan Tema</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Pilih nuansa terang atau gelap
                      </p>
                    </div>
                    <div className="p-2 space-y-1">
                      {themeOptions.map((option) => {
                        const OptIcon = option.icon;
                        const isSelected = themeMode === option.mode;
                        return (
                          <button
                            key={option.mode}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            onClick={() => {
                              setThemeMode(option.mode);
                              setShowThemeMenu(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-2xl text-left transition-colors cursor-pointer min-h-[44px] ${
                              isSelected
                                ? 'bg-[#e8f4fd] dark:bg-[#0088f8]/20 text-[#0070e0] dark:text-[#60b5ff]'
                                : 'hover:bg-slate-50 dark:hover:bg-[#18263d] text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-8 h-8 aspect-square rounded-xl flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-[#0088f8] text-white'
                                  : 'bg-slate-100 dark:bg-[#1e2f4a] text-slate-600 dark:text-slate-300'
                              }`}>
                                <OptIcon className="w-4 h-4 stroke-[2]" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold leading-tight truncate">{option.label}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{option.desc}</p>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 shrink-0 text-[#0088f8] dark:text-[#60b5ff]" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Notifications (3D Bevel Floating Blue) */}
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => {
                  setNotifActionError('');
                  setShowNotifications((prev) => !prev);
                  setShowThemeMenu(false);
                }}
                className="icon-btn-lg btn-3d-floating text-white relative overflow-visible"
                title="Notifikasi & Pengingat"
                aria-label="Notifikasi"
                aria-expanded={showNotifications}
              >
                <Bell className="w-6 h-6 stroke-[2] relative z-10" />
                <AnimatePresence mode="wait">
                  {unreadCount > 0 && (
                    <motion.span
                      key={`header-notif-dot-${unreadCount}`}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: shouldReduceMotion ? 0.06 : 0.16 }}
                      className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-[#ff3b30] text-white text-[10px] font-bold rounded-lg flex items-center justify-center ring-2 ring-white dark:ring-[#0b1b36] tabular-nums z-20"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.97 }}
                    transition={{ duration: shouldReduceMotion ? 0.08 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed left-4 right-4 top-[4.8rem] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 origin-top sm:origin-top-right bg-white dark:bg-[#111c2e] rounded-3xl shadow-2xl shadow-blue-900/20 dark:shadow-black/60 border border-slate-200 dark:border-slate-800 z-[100] overflow-hidden text-slate-900 dark:text-slate-100"
                  >
                    <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-[#edf6fe] dark:bg-[#18263d] flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
                          Notifikasi & Pengingat
                        </h3>
                        {unreadCount > 0 ? (
                          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#e11d48] dark:text-[#fb7185] mt-0.5 tabular-nums">
                            <span className="w-2 h-2 rounded-full bg-[#ff3b30] shrink-0" aria-hidden="true" />
                            <span>{unreadCount} notifikasi baru belum dibaca</span>
                          </p>
                        ) : (
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                            Semua sudah dibaca
                          </p>
                        )}
                      </div>
                      <AnimatePresence>
                        {unreadCount > 0 && (
                          <motion.button
                            key="mark-all-read-btn"
                            type="button"
                            onClick={() => void handleMarkAllRead()}
                            disabled={isMarkingAllRead || !isOnline}
                            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.94 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.94 }}
                            transition={{ duration: shouldReduceMotion ? 0.06 : 0.16, ease: [0.16, 1, 0.3, 1] }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-xl bg-white dark:bg-[#111c2e] hover:bg-blue-50 dark:hover:bg-[#1f304d] border border-blue-200/80 dark:border-blue-500/30 text-[#0070e0] dark:text-[#60b5ff] text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                            title={!isOnline ? 'Butuh koneksi internet' : 'Tandai semua notifikasi sudah dibaca'}
                          >
                            {isMarkingAllRead ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            ) : (
                              <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{isMarkingAllRead ? 'Memproses...' : 'Baca Semua'}</span>
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                    {notifActionError && (
                      <div className="px-4 py-2.5 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200/80 dark:border-rose-800/60 flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{notifActionError}</span>
                      </div>
                    )}
                    <div className="max-h-[340px] overflow-y-auto">
                      {notifications.length > 0 ? (
                        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800/80">
                          {notifications.map(notif => {
                            const isUnread = !isNotificationReadForUser(notif, currentUser?.uid);
                            const target = resolveNotificationTarget(notif, currentUser?.role);
                            const ms = safeTimeMs(notif.date);
                            const formattedDate = ms
                              ? new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                              : '-';
                            return (
                              <button
                                key={notif.id}
                                type="button"
                                onClick={() => handleNotificationClick(notif)}
                                className={`w-full text-left px-5 py-3.5 cursor-pointer transition-colors group focus-visible:outline-none ${
                                  isUnread
                                    ? 'bg-rose-50/65 dark:bg-rose-950/25 hover:bg-rose-50 dark:hover:bg-rose-950/40 focus-visible:bg-rose-50 dark:focus-visible:bg-rose-950/40'
                                    : 'hover:bg-blue-50/50 dark:hover:bg-[#18263d] focus-visible:bg-blue-50/70 dark:focus-visible:bg-[#18263d]'
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2.5 mb-1">
                                  <h4 className={`text-sm leading-snug ${isUnread ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>
                                    {notif.title}
                                  </h4>
                                  {isUnread && (
                                    <span className="inline-flex items-center gap-1 shrink-0 mt-0.5 text-[11px] font-bold text-[#e11d48] dark:text-[#fb7185]">
                                      <span className="w-2 h-2 bg-[#ff3b30] rounded-full" aria-hidden="true" />
                                      <span>Baru</span>
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{notif.message}</p>
                                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2">
                                  <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                                    {formattedDate}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0070e0] dark:text-[#60b5ff] group-hover:underline">
                                    <span>{target.label}</span>
                                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                          Belum ada notifikasi
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="icon-btn-lg btn-3d-rose text-white relative overflow-hidden"
              title="Keluar"
              aria-label="Keluar"
            >
              <LogOut className="w-6 h-6 stroke-[2] relative z-10" />
            </button>
          </div>
        </div>
      </header>

      {/* Profile Photo Upload Modal (Triggered from Header Avatar) */}
      <AnimatePresence>
        {showPhotoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.08 : 0.2 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/65 dark:bg-black/80 sm:backdrop-blur-xs"
          >
            <motion.div
              initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.97 }}
              transition={{ duration: shouldReduceMotion ? 0.08 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white dark:bg-[#111c2e] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800"
            >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#162339]">
              <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">Foto Profil</h3>
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                className="icon-btn-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-24 h-24 aspect-square rounded-3xl bg-[#eaf4fe] dark:bg-[#152843] border border-blue-200/80 dark:border-blue-400/25 flex items-center justify-center overflow-hidden">
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : currentUser?.role === 'admin' ? (
                  <Icon3D icon={ShieldCheck} size="xl" variant="softBlue" className="w-full h-full border-0 shadow-none" />
                ) : (
                  <span className="font-display text-2xl font-bold text-[#0088f8] dark:text-[#60b5ff]">
                    {getInitials(displayName)}
                  </span>
                )}
              </div>

              <div>
                <p className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">{displayName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitleInfo}</p>
              </div>

              {photoError && (
                <div className="w-full flex items-center gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 dark:border dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-medium text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{photoError}</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp"
                className="hidden"
                onChange={handlePhotoSelect}
              />

              <div className="w-full flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-[#0088f8] hover:bg-[#0070e0] text-white font-bold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isUpdatingPhoto ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Foto...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 icon-3d-glyph" />
                      <span>{profilePhoto ? 'Ganti Foto Profil' : 'Upload Foto Profil'}</span>
                    </>
                  )}
                </button>

                {profilePhoto && (
                  <button
                    type="button"
                    disabled={isUpdatingPhoto}
                    onClick={handleRemovePhoto}
                    className="w-full min-h-[44px] px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-semibold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4 icon-3d-glyph-soft" />
                    <span>Hapus Foto</span>
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Format JPG, PNG, atau WebP. Foto akan dikompresi otomatis.
              </p>
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
