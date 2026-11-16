import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAppContext } from '../AppContext';
import {
  formatIDR,
  getMonthName,
  getInitials,
  getResidentPaymentSummary,
  normalizePaymentStatus,
  safeTimeMs
} from '../utils';
import {
  Banknote,
  CheckCircle2,
  Clock,
  Users,
  Landmark,
  AlertTriangle,
  Hourglass,
  ChevronRight,
  Copy,
  Check,
  ArrowUpRight,
  Wallet,
  TrendingDown
} from 'lucide-react';
import { Resident } from '../types';
import { Icon3D } from './Icon3D';
import { UnpaidDuesReminder } from './UnpaidDuesReminder';
import { NotificationPermissionBanner } from './NotificationPermissionBanner';

interface DashboardProps {
  onNavigateToPayments?: () => void;
  onChangeView?: (view: 'dashboard' | 'residents' | 'payments' | 'reports' | 'settings') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigateToPayments, onChangeView }) => {
  const { currentUser, residents, payments, expenses, bankAccount } = useAppContext();

  const [activeTab, setActiveTab] = useState<'masuk' | 'sudah' | 'belum' | 'warga'>('masuk');
  const [copiedAccount, setCopiedAccount] = useState(false);
  const residentListRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const isResident = currentUser?.role === 'resident';
  const reminderStorageKey = `dues_reminder_dismissed_${currentUser?.uid || 'guest'}_${currentYear}_${currentMonth}`;

  const [isReminderDismissed, setIsReminderDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(reminderStorageKey) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      setIsReminderDismissed(sessionStorage.getItem(reminderStorageKey) === '1');
    } catch {
      setIsReminderDismissed(false);
    }
  }, [reminderStorageKey]);

  const handleDismissReminder = () => {
    setIsReminderDismissed(true);
    try {
      sessionStorage.setItem(reminderStorageKey, '1');
    } catch {
      // Ignore storage errors in restricted environments
    }
  };

  // Authoritative monthly & overall community cash calculations
  const monthSummary = useMemo(
    () => getResidentPaymentSummary(residents, payments, currentMonth, currentYear),
    [residents, payments, currentMonth, currentYear]
  );

  const pendingPayments = useMemo(
    () =>
      payments.filter(
        p => normalizePaymentStatus(p) === 'pending' || normalizePaymentStatus(p) === 'tertunda'
      ),
    [payments]
  );

  const {
    totalCollected,
    paidCount,
    unpaidCount,
    collectionPercent,
  } = useMemo(() => {
    const collected = monthSummary.paid.reduce((sum, entry) => sum + (entry.payment?.amount || 0), 0);
    const paid = monthSummary.paid.length;
    const unpaid = monthSummary.notPaidYet.length + monthSummary.pending.length;
    const percent = residents.length > 0 ? Math.round((paid / residents.length) * 100) : 0;
    return {
      totalCollected: collected,
      paidCount: paid,
      unpaidCount: unpaid,
      collectionPercent: percent,
    };
  }, [monthSummary, residents.length]);

  const {
    totalCollectedAllTime,
    totalExpensesAllTime,
    overallCashBalance,
    currentMonthExpenses,
  } = useMemo(() => {
    const verified = payments.filter(p => normalizePaymentStatus(p) === 'verified');
    const collectedAll = verified.reduce((sum, p) => sum + p.amount, 0);
    const expensesAll = expenses.reduce((sum, e) => sum + e.amount, 0);
    const monthExp = expenses
      .filter(e => Number(e.month) === currentMonth && Number(e.year) === currentYear)
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      totalCollectedAllTime: collectedAll,
      totalExpensesAllTime: expensesAll,
      overallCashBalance: collectedAll - expensesAll,
      currentMonthExpenses: monthExp,
    };
  }, [payments, expenses, currentMonth, currentYear]);

  // Resident data lookup
  const resident = useMemo(
    () =>
      isResident
        ? residents.find(r => r.userId === currentUser?.uid || r.id === currentUser?.residentId) || null
        : null,
    [isResident, residents, currentUser?.uid, currentUser?.residentId]
  );

  const myPayments = useMemo(
    () => (resident ? payments.filter(p => p.residentId === resident.id) : []),
    [resident, payments]
  );

  const myCurrentMonthPayment = useMemo(
    () => (resident ? monthSummary.entries.find(e => e.resident.id === resident.id) : undefined),
    [resident, monthSummary]
  );
  const myCurrentStatus = myCurrentMonthPayment?.status || 'unpaid';
  const isCurrentMonthPaid = myCurrentStatus === 'verified';

  const residentMap = useMemo(
    () => new Map(residents.map((r) => [r.id, r])),
    [residents]
  );

  const recentPayments = useMemo(
    () =>
      [...(isResident ? myPayments : payments)]
        .sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date))
        .slice(0, 5),
    [isResident, myPayments, payments]
  );

  const handleNav = (target: 'dashboard' | 'residents' | 'payments' | 'reports' | 'settings') => {
    if (onChangeView) {
      onChangeView(target);
    } else if (target === 'payments' && onNavigateToPayments) {
      onNavigateToPayments();
    }
  };

  const handleCopyAccount = async () => {
    const cleanNumber = (bankAccount.accountNumber || '').replace(/\s+/g, '');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(cleanNumber);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = cleanNumber;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    } catch (err) {
      console.error('Gagal menyalin nomor rekening:', err);
    }
  };

  // Admin summary tabs (strict 1-icon-1-feature mapping)
  const adminSummaryTabs = [
    { id: 'masuk' as const, label: 'Terkumpul', icon: Banknote, variant: 'blue' as const },
    { id: 'sudah' as const, label: 'Sudah Bayar', icon: CheckCircle2, variant: 'emerald' as const },
    { id: 'belum' as const, label: 'Belum Bayar', icon: Clock, variant: 'amber' as const },
    { id: 'warga' as const, label: 'Total Warga', icon: Users, variant: 'blue' as const },
  ];

  // Residents shown in Beranda inline status list when Admin selects Sudah Bayar / Belum Bayar / Total Warga
  const tabResidentEntries =
    activeTab === 'sudah'
      ? monthSummary.paid
      : activeTab === 'belum'
      ? [...monthSummary.notPaidYet, ...monthSummary.pending]
      : monthSummary.entries;

  const adminUnpaidCount = monthSummary.notPaidYet.length;
  const adminUnpaidTotal = monthSummary.notPaidYet.reduce(
    (sum, entry) => sum + (entry.payment?.amount || entry.resident.monthlyDues || 150000),
    0
  );
  const showResidentReminder =
    isResident &&
    Boolean(resident) &&
    !isReminderDismissed &&
    (myCurrentStatus === 'unpaid' || myCurrentStatus === 'tertunda');
  const showAdminReminder =
    !isResident &&
    !isReminderDismissed &&
    adminUnpaidCount > 0;

  const handleAdminViewUnpaidList = () => {
    setActiveTab('belum');
    setTimeout(() => {
      residentListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  return (
    <div className="space-y-5 pb-4">
      {/* BANNER IZIN NOTIFIKASI BAR SMARTPHONE TANGGAL 1 (KHUSUS WARGA) */}
      {isResident && resident && currentUser && (
        <NotificationPermissionBanner
          userId={currentUser.uid}
          resident={resident}
          payments={payments}
        />
      )}

      {/* 0. NOTIFIKASI PENGINGAT OTOMATIS IURAN BULAN BERJALAN */}
      {(showResidentReminder || showAdminReminder) && (
        <UnpaidDuesReminder
          key={reminderStorageKey}
          role={isResident ? 'resident' : 'admin'}
          monthName={getMonthName(currentMonth)}
          year={currentYear}
          residentStatus={myCurrentStatus === 'tertunda' ? 'tertunda' : 'unpaid'}
          residentAmount={myCurrentMonthPayment?.payment?.amount || resident?.monthlyDues || 150000}
          residentUnitLabel={
            resident
              ? `${resident.propertyType}${resident.block ? ` Blok ${resident.block}` : ''} No. ${resident.houseNumber}`
              : undefined
          }
          unpaidCount={adminUnpaidCount}
          unpaidTotalAmount={adminUnpaidTotal}
          tertundaCount={monthSummary.tertunda.length}
          onAction={isResident ? () => handleNav('payments') : handleAdminViewUnpaidList}
          onDismiss={handleDismissReminder}
        />
      )}

      {/* TOP PAGE HEADER (Symmetrical across all menus) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isResident ? 'Transparansi Kas Paguyuban' : 'Ringkasan Kas & Iuran'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Periode {getMonthName(currentMonth)} {currentYear}
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleNav('reports')}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white dark:bg-[#111c2e] hover:bg-[#e8f4fd] dark:hover:bg-[#18263d] text-[#0088f8] dark:text-[#60b5ff] border border-blue-200/80 dark:border-blue-500/30 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[44px] shadow-2xs"
        >
          <span>Lihat Laporan</span>
          <ChevronRight className="w-4 h-4 icon-3d-glyph-soft" />
        </button>
      </div>

      {/* 1. RINGKASAN UTAMA */}
      <section className="dashboard-card-hover bg-white dark:bg-[#111c2e] rounded-3xl p-5 sm:p-6 shadow-xs border border-slate-200/70 dark:border-slate-800/90">
        <div className="flex items-center justify-between gap-3 pb-3.5 mb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {isResident ? 'Ringkasan Keuangan Warga' : 'Statistik Iuran Bulan Ini'}
            </h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Pantauan kas masuk dan status partisipasi warga
            </p>
          </div>
        </div>

        {isResident ? (
          /* RESIDENT INITIAL DASHBOARD: 3 COMMUNITY CASH METRICS */
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* 1. Saldo Terkumpul di Bulan Berjalan */}
              <div className="dashboard-card-hover p-4 sm:p-5 rounded-2xl bg-[#edf6fe]/85 dark:bg-[#152843]/85 border border-blue-200/70 dark:border-blue-500/25 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Saldo Terkumpul ({getMonthName(currentMonth)})
                    </p>
                    <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1 tabular-nums">
                      {formatIDR(totalCollected)}
                    </p>
                  </div>
                  <Icon3D icon={Banknote} size="md" variant="blue" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1.5 tabular-nums">
                    <span>Partisipasi bulan ini</span>
                    <span className="font-bold text-[#0070e0] dark:text-[#60b5ff]">
                      {paidCount}/{residents.length} warga ({collectionPercent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white dark:bg-[#0b1220] rounded-full overflow-hidden border border-blue-100 dark:border-blue-900/50">
                    <div
                      className="h-full bg-[#0088f8] rounded-full transition-all duration-300"
                      style={{ width: `${collectionPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Saldo Kas Secara Keseluruhan */}
              <div className="dashboard-card-hover p-4 sm:p-5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/70 dark:border-emerald-500/25 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Saldo Kas Keseluruhan
                    </p>
                    <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1 tabular-nums">
                      {formatIDR(overallCashBalance)}
                    </p>
                  </div>
                  <Icon3D icon={Wallet} size="md" variant="emerald" />
                </div>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 font-medium">
                  Total kas bersih seluruh pemasukan dikurangi pengeluaran.
                </p>
              </div>

              {/* 3. Saldo Keluar */}
              <div className="dashboard-card-hover p-4 sm:p-5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/35 border border-rose-200/70 dark:border-rose-500/25 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Saldo Keluar
                    </p>
                    <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1 tabular-nums">
                      {formatIDR(totalExpensesAllTime)}
                    </p>
                  </div>
                  <Icon3D icon={TrendingDown} size="md" variant="rose" />
                </div>
                <p className="text-xs text-rose-800/90 dark:text-rose-300/90 font-medium tabular-nums">
                  Bulan ini: {formatIDR(currentMonthExpenses)} · {expenses.length} catatan pengeluaran
                </p>
              </div>
            </div>

            {/* Compact Personal Monthly Status Strip */}
            <div className="dashboard-card-hover p-4 rounded-2xl bg-slate-50/90 dark:bg-[#18263d]/80 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Icon3D
                  icon={
                    myCurrentStatus === 'verified'
                      ? CheckCircle2
                      : myCurrentStatus === 'pending'
                      ? Hourglass
                      : myCurrentStatus === 'tertunda'
                      ? AlertTriangle
                      : Clock
                  }
                  size="md"
                  variant={
                    myCurrentStatus === 'verified'
                      ? 'softEmerald'
                      : myCurrentStatus === 'pending'
                      ? 'softBlue'
                      : myCurrentStatus === 'tertunda'
                      ? 'softAmber'
                      : 'softRose'
                  }
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Status Iuran Anda · {getMonthName(currentMonth)} {currentYear}
                  </p>
                  <p className="font-display font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base mt-0.5 tabular-nums">
                    {isCurrentMonthPaid
                      ? 'Sudah Lunas (Rp 0)'
                      : myCurrentStatus === 'pending'
                      ? `Menunggu Verifikasi · ${formatIDR(myCurrentMonthPayment?.payment?.amount || resident?.monthlyDues || 150000)}`
                      : `Tagihan ${formatIDR(resident?.monthlyDues || 150000)} (${myCurrentStatus === 'tertunda' ? 'Tertunda' : 'Belum Bayar'})`}
                  </p>
                </div>
              </div>

              {!isCurrentMonthPaid && (
                <button
                  type="button"
                  onClick={() => handleNav('payments')}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer shrink-0 min-h-[44px] whitespace-nowrap shadow-sm shadow-blue-500/20"
                >
                  <span>{myCurrentStatus === 'pending' ? 'Lihat Status' : 'Bayar Sekarang'}</span>
                  <ArrowUpRight className="w-4 h-4 icon-3d-glyph" />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ADMIN VIEW: 4-TAB SUMMARY & EXPANDABLE RESIDENT LIST */
          <>
            <div className="grid grid-cols-4 gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 pt-1">
              {adminSummaryTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="flex flex-col items-center justify-center gap-1.5 py-1.5 relative cursor-pointer group min-h-[44px]"
                  >
                    <Icon3D
                      icon={tab.icon}
                      size="md"
                      variant={isActive ? tab.variant : 'slate'}
                      className={isActive ? 'scale-105' : 'group-hover:scale-105'}
                    />
                    <span className={`text-xs tracking-tight whitespace-nowrap ${
                      isActive ? 'text-slate-900 dark:text-slate-100 font-bold' : 'text-slate-600 dark:text-slate-400 font-medium'
                    }`}>
                      {tab.label}
                    </span>
                    {isActive && (
                      <div className="absolute -bottom-[13px] left-2 right-2 h-[3px] bg-[#0088f8] rounded-md"></div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Tab Metric Panel & Resident List with 250ms Pure Fade */}
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: shouldReduceMotion ? 0.08 : 0.25,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
            <div className="dashboard-card-hover mt-4 p-4 sm:p-5 rounded-2xl bg-[#edf6fe]/80 dark:bg-[#152843]/85 border border-blue-100 dark:border-blue-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {activeTab === 'masuk'
                    ? `Kas Terkumpul (${getMonthName(currentMonth)} ${currentYear})`
                    : activeTab === 'sudah'
                    ? 'Warga Sudah Bayar Bulan Ini'
                    : activeTab === 'belum'
                    ? 'Warga Belum Lunas Bulan Ini'
                    : 'Jumlah Warga Terdaftar'}
                </p>
                <p className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1 tabular-nums">
                  {activeTab === 'masuk'
                    ? formatIDR(totalCollected)
                    : activeTab === 'sudah'
                    ? `${paidCount} Warga`
                    : activeTab === 'belum'
                    ? `${unpaidCount} Warga`
                    : `${residents.length} Warga`}
                </p>

                {residents.length > 0 && (
                  <div className="mt-3 max-w-sm">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1 tabular-nums">
                      <span>Progres pelunasan bulan ini</span>
                      <span className="font-bold text-[#0088f8] dark:text-[#60b5ff]">{paidCount}/{residents.length} ({collectionPercent}%)</span>
                    </div>
                    <div className="w-full h-2 bg-white dark:bg-[#0b1220] rounded-full overflow-hidden border border-blue-100 dark:border-blue-900/50">
                      <div
                        className="h-full bg-[#0088f8] rounded-full transition-all duration-300"
                        style={{ width: `${collectionPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {(activeTab === 'sudah' || activeTab === 'belum' || activeTab === 'warga') && (
                <button
                  type="button"
                  onClick={() => handleNav('residents')}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white dark:bg-[#111c2e] hover:bg-blue-50 dark:hover:bg-[#1b2d4a] text-[#0088f8] dark:text-[#60b5ff] border border-blue-200 dark:border-blue-500/30 text-xs sm:text-sm font-bold transition-colors cursor-pointer shrink-0 min-h-[44px] whitespace-nowrap"
                >
                  <span>Kelola Data Warga</span>
                  <ArrowUpRight className="w-4 h-4 icon-3d-glyph-soft" />
                </button>
              )}
            </div>

            {/* INLINE PRACTICAL RESIDENT STATUS LIST FOR ADMIN ON BERANDA */}
            {(activeTab === 'sudah' || activeTab === 'belum' || activeTab === 'warga') && (
              <div ref={residentListRef} className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {activeTab === 'sudah'
                      ? `Daftar Warga Sudah Bayar (${tabResidentEntries.length})`
                      : activeTab === 'belum'
                      ? `Daftar Warga Belum Lunas (${tabResidentEntries.length})`
                      : `Daftar Status Warga Bulan ${getMonthName(currentMonth)} (${tabResidentEntries.length})`}
                  </h2>
                  <button
                    type="button"
                    onClick={() => handleNav('residents')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-bold text-[#0088f8] dark:text-[#60b5ff] hover:bg-[#e8f4fd] dark:hover:bg-[#18263d] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Buka Semua
                  </button>
                </div>

                {tabResidentEntries.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {tabResidentEntries.map(({ resident: resItem, payment, status }) => (
                      <div
                        key={resItem.id}
                        className="perf-list-item dashboard-card-hover flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-[#18263d]/60 hover:bg-white dark:hover:bg-[#18263d]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 aspect-square rounded-xl bg-[#e8f4fd] dark:bg-[#1b3352] text-[#0088f8] dark:text-[#60b5ff] font-display font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden border border-blue-100 dark:border-blue-400/20">
                            {resItem.photoUrl ? (
                              <img
                                src={resItem.photoUrl}
                                alt={resItem.name}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{getInitials(resItem.name)}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">{resItem.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
                              {resItem.propertyType}{resItem.block ? ` Blok ${resItem.block}` : ''} No. {resItem.houseNumber} · {formatIDR(payment?.amount || resItem.monthlyDues || 150000)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {status === 'verified' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl border border-emerald-200/70 dark:border-emerald-700/50">
                              <CheckCircle2 className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                              <span>Lunas</span>
                            </span>
                          ) : status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => handleNav('payments')}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0070e0] dark:text-[#60b5ff] bg-[#e8f4fd] dark:bg-[#1b3352] hover:bg-blue-100 dark:hover:bg-[#224066] px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-500/30 cursor-pointer min-h-[40px] whitespace-nowrap"
                            >
                              <Hourglass className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                              <span>Verifikasi</span>
                            </button>
                          ) : status === 'tertunda' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 dark:border dark:border-amber-700/50 px-2.5 py-1 rounded-xl">
                              <AlertTriangle className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                              <span>Tertunda</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-xl border border-rose-200/70 dark:border-rose-700/50">
                              <Clock className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                              <span>Belum</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#18263d]/60 rounded-2xl">
                    {activeTab === 'belum'
                      ? 'Semua warga sudah melunasi iuran bulan ini.'
                      : 'Belum ada data warga pada kategori ini.'}
                  </div>
                )}
              </div>
            )}
            </motion.div>
          </>
        )}
      </section>

      {/* 2. NOTIFIKASI VERIFIKASI UNTUK ADMIN */}
      {!isResident && pendingPayments.length > 0 && (
        <section className="dashboard-card-hover bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-700/40 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <Icon3D icon={AlertTriangle} size="lg" variant="amber" />
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300 tabular-nums">
                Perlu Verifikasi · {pendingPayments.length} Pembayaran Masuk / Tertunda
              </p>
              <h2 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base mt-0.5">
                Terdapat Tagihan & Bukti Transfer Menunggu Tindak Lanjut
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Periksa bukti pembayaran agar status iuran warga tercatat lunas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToPayments}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#0088f8] hover:bg-[#0070e0] text-white text-xs sm:text-sm font-bold rounded-2xl transition-colors shrink-0 cursor-pointer min-h-[44px] whitespace-nowrap"
          >
            Verifikasi ({pendingPayments.length})
          </button>
        </section>
      )}

      {/* 3. INFO REKENING RINGKAS UNTUK WARGA BELUM BAYAR */}
      {isResident && !isCurrentMonthPaid && (
        <section className="dashboard-card-hover bg-white dark:bg-[#111c2e] rounded-3xl p-5 sm:p-6 border border-slate-200/70 dark:border-slate-800/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <Icon3D icon={Landmark} size="lg" variant="blue" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Rekening Tujuan · {bankAccount.bankName} a.n. {bankAccount.accountName}
              </p>
              <p className="font-mono font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100 tracking-wide mt-0.5 tabular-nums">
                {bankAccount.accountNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyAccount}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap ${
                copiedAccount
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#e8f4fd] dark:bg-[#18263d] hover:bg-[#d6ecfc] dark:hover:bg-[#1f3252] text-[#0070e0] dark:text-[#60b5ff]'
              }`}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={copiedAccount ? 'copied' : 'copy'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0.06 : 0.14 }}
                  className="inline-flex items-center gap-1.5"
                >
                  {copiedAccount ? <Check className="w-4 h-4 icon-3d-glyph" /> : <Copy className="w-4 h-4 icon-3d-glyph-soft" />}
                  <span>{copiedAccount ? 'Tersalin!' : 'Salin No. Rek'}</span>
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              type="button"
              onClick={() => handleNav('payments')}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-xs font-bold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap"
            >
              <span>Upload Bukti</span>
            </button>
          </div>
        </section>
      )}

      {/* 4. TRANSAKSI TERAKHIR */}
      <section className="dashboard-card-hover bg-white dark:bg-[#111c2e] rounded-3xl overflow-hidden shadow-xs border border-slate-200/70 dark:border-slate-800/90">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Transaksi Terakhir
          </h2>
          <button
            type="button"
            onClick={() => handleNav('payments')}
            className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-bold text-[#0088f8] dark:text-[#60b5ff] hover:bg-[#e8f4fd] dark:hover:bg-[#18263d] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Lihat Semua
          </button>
        </div>

        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800/80">
          {recentPayments.length > 0 ? (
            recentPayments.map((payment, index) => {
              const res = residentMap.get(payment.residentId);
              const status = normalizePaymentStatus(payment);
              return (
                <motion.div
                  key={payment.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: Math.min(index, 4) * 0.02 }}
                  className="px-5 sm:px-6 py-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-[#18263d]/70 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 aspect-square rounded-[14px] bg-[#eaf4fe] dark:bg-[#152843] border border-blue-200/80 dark:border-blue-400/25 text-[#0078e0] dark:text-[#60b5ff] font-display font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                      {res?.photoUrl ? (
                        <img
                          src={res.photoUrl}
                          alt={res.name}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{getInitials(res?.name || 'Warga')}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                        {res?.name || 'Warga Paguyuban'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {res ? `${res.propertyType}${res.block ? ` Blok ${res.block}` : ''} No. ${res.houseNumber}` : 'Iuran Bulanan'} · {getMonthName(payment.month)} {payment.year}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base tabular-nums">
                      {formatIDR(payment.amount)}
                    </div>
                    <div className="mt-1">
                      {status === 'tertunda' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                          <span>Tertunda</span>
                        </span>
                      ) : status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0088f8] dark:text-[#60b5ff]">
                          <Hourglass className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                          <span>Verifikasi</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                          <span>Lunas</span>
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              Belum ada riwayat transaksi.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

