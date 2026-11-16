import React, { useState } from 'react';
import { AlertTriangle, Lock, LogIn, User, WifiOff } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { collection, doc, getDocFromServer, getDocsFromServer, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppContext } from '../AppContext';
import { translateErrorToIndonesian } from '../utils';
import { PWAInstallButton } from './PWAInstallButton';

export const Login: React.FC = () => {
  const { signInUser, isOnline, authNotice, clearAuthNotice } = useAppContext();
  const [idLogin, setIdLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthNotice();
    setError('');

    if (!isOnline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setError('Perangkat sedang offline. Hubungkan ke internet untuk masuk dan menyinkronkan data dari cloud.');
      return;
    }

    setIsLoading(true);
    const id = idLogin.trim();

    try {
      // 1. Official admin account verified strictly from Cloud Firestore server
      if (id.toLowerCase() === 'admin') {
        const adminDoc = await getDocFromServer(doc(db, 'users', 'admin_uid'));
        let validAdmin = false;
        let adminPhotoUrl: string | undefined;
        let adminName = 'Admin Paguyuban';
        let adminPwdUpdatedAt: string | undefined;

        if (adminDoc.exists()) {
          const data = adminDoc.data();
          if (data.password === password) {
            validAdmin = true;
            adminPhotoUrl = data.photoUrl;
            if (data.name) adminName = data.name;
            if (typeof data.passwordUpdatedAt === 'string') {
              adminPwdUpdatedAt = data.passwordUpdatedAt;
            }
          }
        } else if (password === 'admin99') {
          validAdmin = true;
          adminPwdUpdatedAt = new Date().toISOString();
          await setDoc(doc(db, 'users', 'admin_uid'), {
            uid: 'admin_uid',
            email: 'admin',
            name: 'Admin Paguyuban',
            password: 'admin99',
            passwordUpdatedAt: adminPwdUpdatedAt,
            role: 'admin',
          });
        }

        if (validAdmin) {
          signInUser({
            uid: 'admin_uid',
            email: 'admin',
            name: adminName,
            ...(adminPhotoUrl ? { photoUrl: adminPhotoUrl } : {}),
            ...(adminPwdUpdatedAt ? { passwordUpdatedAt: adminPwdUpdatedAt } : {}),
            role: 'admin',
          });
          return;
        } else {
          setError('Password admin salah. Silakan periksa kembali password Anda.');
          return;
        }
      }

      // 2. Fetch users strictly from Cloud Firestore server (no localStorage fallback)
      const usersSnap = await getDocsFromServer(collection(db, 'users'));
      let foundUser: any = null;
      usersSnap.forEach((docSnap) => {
        const u = docSnap.data();
        if (
          (u.email?.toLowerCase() === id.toLowerCase() || u.uid === id) &&
          u.password === password
        ) {
          foundUser = u;
        }
      });

      if (foundUser) {
        let resolvedName: string | undefined = foundUser.name;
        let resolvedPhoto: string | undefined = foundUser.photoUrl;
        if ((!resolvedName || !resolvedPhoto) && foundUser.residentId) {
          try {
            const resSnap = await getDocFromServer(doc(db, 'residents', foundUser.residentId));
            if (resSnap.exists()) {
              const resData = resSnap.data();
              if (!resolvedName) resolvedName = resData.name;
              if (!resolvedPhoto) resolvedPhoto = resData.photoUrl;
            }
          } catch {
            // Fallback to AppContext resident lookup after hydration
          }
        }

        signInUser({
          uid: foundUser.uid,
          email: foundUser.email,
          ...(resolvedName ? { name: resolvedName } : {}),
          ...(resolvedPhoto ? { photoUrl: resolvedPhoto } : {}),
          ...(typeof foundUser.passwordUpdatedAt === 'string'
            ? { passwordUpdatedAt: foundUser.passwordUpdatedAt }
            : {}),
          role: foundUser.role,
          ...(foundUser.residentId ? { residentId: foundUser.residentId } : {}),
        });
      } else {
        setError('ID Pengguna atau Password salah. Silakan periksa kembali data Anda.');
      }
    } catch (err: unknown) {
      setError(
        translateErrorToIndonesian(
          err,
          'Gagal terhubung ke server cloud. Periksa koneksi internet Anda lalu coba lagi.'
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-full max-w-full relative overflow-x-hidden overflow-y-auto flex items-center justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-gradient-to-br from-[#0052b4] via-[#007ae5] to-[#26a4ff] dark:from-[#060f1f] dark:via-[#0b1b36] dark:to-[#0f2b52] transition-colors">
      {/* Layer 1: Base subtle directional sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(0,48,120,0.35),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(38,164,255,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(4,10,20,0.7),transparent_60%)]"
      />

      {/* Layer 2: Soft ambient radial glow orbs (desktop/tablet only for smooth low-end mobile GPU) */}
      <div
        aria-hidden="true"
        className="hidden sm:block pointer-events-none absolute -top-28 -left-24 w-96 h-96 sm:w-[32rem] sm:h-[32rem] rounded-full bg-[#7dd3fc]/35 dark:bg-[#0088f8]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="hidden sm:block pointer-events-none absolute top-1/3 -right-28 w-80 h-80 sm:w-[28rem] sm:h-[28rem] rounded-full bg-[#bae6fd]/25 dark:bg-[#38bdf8]/12 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="hidden sm:block pointer-events-none absolute -bottom-24 left-1/4 w-96 h-96 rounded-full bg-[#003c8f]/35 dark:bg-[#040a14]/65 blur-3xl"
      />

      {/* Layer 3: Layered smooth SVG translucent waves across bottom & middle canvas */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[55vh] min-h-[300px] overflow-hidden">
        <svg
          viewBox="0 0 1440 420"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 w-full h-full"
        >
          <path
            d="M0,180 C240,90 480,260 760,180 C1040,100 1260,150 1440,210 L1440,420 L0,420 Z"
            className="fill-white/10 dark:fill-[#60b5ff]/[0.06]"
          />
        </svg>
        <svg
          viewBox="0 0 1440 360"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 w-full h-[82%]"
        >
          <path
            d="M0,130 C300,230 580,70 900,155 C1150,220 1310,120 1440,150 L1440,360 L0,360 Z"
            className="fill-[#bae6fd]/20 dark:fill-[#0088f8]/[0.09]"
          />
        </svg>
        <svg
          viewBox="0 0 1440 280"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 w-full h-[62%]"
        >
          <path
            d="M0,145 C280,75 560,210 860,135 C1120,70 1300,145 1440,115 L1440,280 L0,280 Z"
            className="fill-white/18 dark:fill-[#060d1a]/55"
          />
        </svg>
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-8 sm:px-8 sm:py-12 lg:px-12 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-14">
        {/* Desktop Branding Column */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="hidden lg:flex lg:w-1/2 flex-col justify-between text-white min-h-[430px] py-4"
        >
          <div>
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-100/90">
                Paguyuban Perumahan
              </p>
              <p className="font-display text-xl font-bold text-white tracking-tight mt-0.5">
                Grand Hannan
              </p>
            </div>

            <h1 className="text-4xl xl:text-5xl font-display font-bold text-white tracking-tight leading-tight">
              Kelola Iuran Warga Lebih Mudah &amp; Transparan
            </h1>
            <p className="mt-5 text-base xl:text-lg text-blue-50/90 max-w-md leading-relaxed">
              Sistem Manajemen Iuran Warga Perumahan. Pantau tagihan bulanan, unggah bukti transfer, dan akses laporan kas bersama secara real-time.
            </p>
          </div>

          <div className="flex items-center gap-3 text-blue-100/90 text-xs font-bold tracking-wider uppercase pt-8">
            <div className="w-10 h-px bg-white/50"></div>
            <span>Portal Iuran Warga</span>
          </div>
        </motion.div>

        {/* Mobile Brand Header + Elevated Login Card */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md lg:w-1/2 lg:max-w-[440px]"
        >
          {/* Mobile Branding Header on Blue Gradient */}
          <div className="mb-6 lg:hidden flex flex-col items-center text-center text-white">
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">
              Grand Hannan
            </h1>
            <p className="text-blue-100/90 text-sm mt-1">
              Sistem Manajemen Iuran Warga
            </p>
          </div>

          {/* Crisp Elevated Form Card */}
          <div className="bg-white/95 dark:bg-[#111c2e]/95 sm:backdrop-blur-md p-6 sm:p-8 rounded-3xl shadow-2xl shadow-blue-950/25 dark:shadow-black/50 border border-white/60 dark:border-slate-700/80 transition-colors">
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Selamat Datang
              </h2>
              <p className="text-[#0088f8] dark:text-[#60b5ff] font-bold uppercase tracking-wider text-xs mt-1">
                Dari Warga Untuk Warga
              </p>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1.5">
                Silakan masukkan ID Pengguna dan Password akun Anda.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {!isOnline && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700/60 text-amber-800 dark:text-amber-300 rounded-2xl text-xs sm:text-sm font-medium">
                  <WifiOff className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Perangkat sedang offline. Sambungkan internet untuk login dan sinkronisasi data cloud.
                  </p>
                </div>
              )}

              {typeof authNotice === 'string' && authNotice && !error && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700/60 text-amber-800 dark:text-amber-300 rounded-2xl text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 icon-3d-glyph-soft" />
                  <p className="leading-relaxed">{authNotice}</p>
                </div>
              )}

              {error && (
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 rounded-2xl text-sm"
                >
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 icon-3d-glyph-soft" />
                  <p className="leading-relaxed">{error}</p>
                </motion.div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    ID Pengguna
                  </label>
                  <div className="relative">
                    <User
                      aria-hidden="true"
                      className="w-[18px] h-[18px] stroke-[2] text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none icon-3d-glyph-soft"
                    />
                    <input
                      type="text"
                      required
                      value={idLogin}
                      onChange={(e) => setIdLogin(e.target.value)}
                      className="w-full min-h-[46px] pl-11 pr-4 py-3 text-sm bg-slate-50/80 dark:bg-[#18263d] border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] focus:bg-white dark:focus:bg-[#1a2b46] transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="Masukkan ID Anda"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      aria-hidden="true"
                      className="w-[18px] h-[18px] stroke-[2] text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none icon-3d-glyph-soft"
                    />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-h-[46px] pl-11 pr-4 py-3 text-sm bg-slate-50/80 dark:bg-[#18263d] border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 focus:border-[#0088f8] focus:bg-white dark:focus:bg-[#1a2b46] transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="Masukkan Password Anda"
                    />
                  </div>
                </div>
              </div>

              <motion.button
                data-no-rebound
                whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                type="submit"
                disabled={isLoading || !isOnline}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 px-5 rounded-2xl shadow-md shadow-blue-500/25 text-sm font-bold text-white bg-[#0088f8] hover:bg-[#0070e0] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0088f8] dark:focus:ring-offset-[#111c2e] transition-all disabled:opacity-70 group cursor-pointer"
              >
                {isLoading ? (
                  'Memproses...'
                ) : (
                  <>
                    <LogIn className="w-4 h-4 stroke-[2] transition-transform group-hover:translate-x-0.5 icon-3d-glyph" />
                    <span>Masuk ke Aplikasi</span>
                  </>
                )}
              </motion.button>

              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex justify-center">
                <PWAInstallButton />
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
