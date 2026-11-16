import React, { useMemo, useState } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'motion/react';
import { useAppContext } from '../AppContext';
import { 
  Plus, 
  Search, 
  Trash2, 
  ReceiptText, 
  FileImage, 
  CheckCircle2, 
  AlertTriangle, 
  Hourglass,
  Phone, 
  Download,
  X 
} from 'lucide-react';
import { 
  generateId, 
  formatIDR, 
  getMonthName, 
  getInitials,
  normalizePaymentStatus,
  safeTimeMs,
  safeFormatDate,
  translateErrorToIndonesian
} from '../utils';
import { buildPaymentsCsv, downloadCsvFile, sanitizeFilenamePart } from '../utils/csvExport';
import { Payment } from '../types';
import { CsvExportModal, CsvExportScope } from './CsvExportModal';
import { Icon3D } from './Icon3D';

export const Payments: React.FC = () => {
  const { 
    residents, 
    payments, 
    addPayment, 
    updatePayment, 
    deletePayment, 
    currentUser, 
    addNotification
  } = useAppContext();
  
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  // 0 means "All months / all years"
  const [filterMonth, setFilterMonth] = useState<number>(currentMonth);
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'verified'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const shouldReduceMotion = useReducedMotion();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [selectedProof, setSelectedProof] = useState<Payment | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [modalError, setModalError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState({
    residentId: '',
    amount: 150000,
    month: currentMonth,
    year: currentYear,
    date: new Date().toISOString().split('T')[0],
    status: 'verified' as 'verified' | 'tertunda',
  });

  // Count pending & tertunda payments accurately using normalized status
  const { pendingPaymentsCount, verifiedPaymentsCount } = useMemo(() => {
    let pending = 0;
    let verified = 0;
    for (const p of payments) {
      const st = normalizePaymentStatus(p);
      if (st === 'pending' || st === 'tertunda') pending++;
      else if (st === 'verified') verified++;
    }
    return { pendingPaymentsCount: pending, verifiedPaymentsCount: verified };
  }, [payments]);

  const residentMap = useMemo(
    () => new Map(residents.map((r) => [r.id, r])),
    [residents]
  );

  const filteredPayments = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return payments
      .filter(p => {
        if (filterMonth !== 0 && Number(p.month) !== Number(filterMonth)) return false;
        if (filterYear !== 0 && Number(p.year) !== Number(filterYear)) return false;

        const st = normalizePaymentStatus(p);
        if (filterStatus === 'pending') {
          if (st !== 'pending' && st !== 'tertunda') return false;
        } else if (filterStatus === 'verified') {
          if (st !== 'verified') return false;
        }

        if (term) {
          const resident = residentMap.get(p.residentId);
          const residentName = resident?.name.toLowerCase() || '';
          const residentHouse = resident?.houseNumber.toLowerCase() || '';
          const residentBlock = resident?.block?.toLowerCase() || '';
          const residentProp = resident?.propertyType.toLowerCase() || '';
          const residentPhone = resident?.phone || '';
          return (
            residentName.includes(term) ||
            residentHouse.includes(term) ||
            residentBlock.includes(term) ||
            residentProp.includes(term) ||
            residentPhone.includes(term)
          );
        }
        return true;
      })
      .sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));
  }, [payments, residentMap, filterMonth, filterYear, filterStatus, searchTerm]);

  const activeFilterSummary = useMemo(() => {
    const statusLabel =
      filterStatus === 'pending'
        ? 'Perlu Verifikasi'
        : filterStatus === 'verified'
        ? 'Selesai (Lunas)'
        : 'Semua Status';
    const monthLabel = filterMonth === 0 ? 'Semua Bulan' : getMonthName(filterMonth);
    const yearLabel = filterYear === 0 ? 'Semua Tahun' : String(filterYear);
    const parts = [statusLabel, `${monthLabel} ${yearLabel}`];
    if (searchTerm.trim()) {
      parts.push(`Cari: "${searchTerm.trim()}"`);
    }
    return parts.join(' · ');
  }, [filterStatus, filterMonth, filterYear, searchTerm]);

  const handleExportCsv = (scope: CsvExportScope) => {
    const targetPayments = scope === 'filtered' ? filteredPayments : payments;
    const csv = buildPaymentsCsv(targetPayments, residents);

    let filename = 'grand-hannan-iuran-semua.csv';
    if (scope === 'filtered') {
      const statusSlug =
        filterStatus === 'pending' ? 'verifikasi' : filterStatus === 'verified' ? 'lunas' : 'semua';
      const periodSlug =
        filterYear === 0
          ? filterMonth === 0
            ? 'semua-periode'
            : `${sanitizeFilenamePart(getMonthName(filterMonth))}`
          : filterMonth === 0
          ? `${filterYear}`
          : `${filterYear}-${String(filterMonth).padStart(2, '0')}`;
      filename = `grand-hannan-iuran-${periodSlug}-${statusSlug}.csv`;
    }

    downloadCsvFile(filename, csv);
    setFeedback({ type: 'success', text: `File arsip "${filename}" berhasil diunduh.` });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Change payment status cleanly without triggering external messaging
  const handleStatusChange = async (payment: Payment, newStatus: 'verified' | 'tertunda' | 'pending') => {
    setIsProcessing(true);
    const resident = residentMap.get(payment.residentId) || null;

    try {
      await updatePayment(payment.id, { status: newStatus });

      if (newStatus === 'tertunda') {
        await addNotification(
          'Status Iuran Tertunda',
          `Status pembayaran iuran ${resident?.name || 'warga'} periode ${getMonthName(payment.month)} ${payment.year} diubah menjadi Tertunda.`,
          {
            targetView: 'payments',
            audience: 'resident',
            recipientResidentId: payment.residentId,
            category: 'payment',
            initialReadBy: currentUser?.uid ? [currentUser.uid] : [],
          }
        ).catch(() => {});
      } else if (newStatus === 'verified') {
        await addNotification(
          'Pembayaran Terverifikasi Lunas',
          `Pembayaran iuran ${resident?.name || 'warga'} periode ${getMonthName(payment.month)} ${payment.year} telah diverifikasi lunas.`,
          {
            targetView: 'payments',
            audience: 'resident',
            recipientResidentId: payment.residentId,
            category: 'payment',
            initialReadBy: currentUser?.uid ? [currentUser.uid] : [],
          }
        ).catch(() => {});
      }

      if (proofModalOpen && selectedProof?.id === payment.id) {
        setSelectedProof(prev => prev ? { ...prev, status: newStatus } : null);
      }
      setFeedback({
        type: 'success',
        text: `Status pembayaran ${resident?.name || 'warga'} berhasil diubah.`
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: translateErrorToIndonesian(err, 'Gagal mengubah status pembayaran.')
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.residentId) return;
    setModalError('');

    // Block duplicates only if already verified or pending; tertunda can be updated cleanly
    const existing = payments.find(
      p => p.residentId === formData.residentId && Number(p.month) === Number(formData.month) && Number(p.year) === Number(formData.year)
    );

    if (existing && normalizePaymentStatus(existing) !== 'tertunda') {
      setModalError('Pembayaran untuk warga ini pada periode tersebut sudah tercatat.');
      return;
    }

    try {
      const newPaymentId = existing ? existing.id : `p_${generateId()}`;
      const newPayment: Payment = {
        id: newPaymentId,
        residentId: formData.residentId,
        amount: Number(formData.amount),
        month: Number(formData.month),
        year: Number(formData.year),
        date: new Date(formData.date).toISOString(),
        status: formData.status
      };

      await addPayment(newPayment);
      
      const targetResident = residentMap.get(formData.residentId) || null;

      if (formData.status === 'tertunda') {
        await addNotification(
          'Status Iuran Tertunda',
          `Tagihan iuran periode ${getMonthName(formData.month)} ${formData.year} dicatat dengan status Tertunda untuk ${targetResident?.name || 'warga'}.`,
          {
            targetView: 'payments',
            audience: 'resident',
            recipientResidentId: formData.residentId,
            category: 'payment',
            initialReadBy: currentUser?.uid ? [currentUser.uid] : [],
          }
        ).catch(() => {});
      } else if (formData.status === 'verified') {
        await addNotification(
          'Pembayaran Iuran Tercatat Lunas',
          `Pembayaran iuran periode ${getMonthName(formData.month)} ${formData.year} sebesar ${formatIDR(Number(formData.amount))} telah dicatat lunas.`,
          {
            targetView: 'payments',
            audience: 'resident',
            recipientResidentId: formData.residentId,
            category: 'payment',
            initialReadBy: currentUser?.uid ? [currentUser.uid] : [],
          }
        ).catch(() => {});
      }

      setIsModalOpen(false);
      setFormData(prev => ({ 
        ...prev, 
        residentId: '', 
        status: 'verified' 
      }));
      setFeedback({
        type: 'success',
        text: `Pembayaran ${targetResident?.name || 'warga'} berhasil dicatat.`
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setModalError(translateErrorToIndonesian(err, 'Gagal mencatat pembayaran.'));
    }
  };

  const unpaidResidents = useMemo(() => {
    if (!isModalOpen) return [];
    const targetMonth = Number(formData.month);
    const targetYear = Number(formData.year);
    const paidOrPendingIds = new Set<string>();
    for (const p of payments) {
      if (Number(p.month) === targetMonth && Number(p.year) === targetYear) {
        if (normalizePaymentStatus(p) !== 'tertunda') {
          paidOrPendingIds.add(p.residentId);
        }
      }
    }
    return residents.filter((r) => !paidOrPendingIds.has(r.id));
  }, [isModalOpen, residents, payments, formData.month, formData.year]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">Pembayaran Iuran</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Catat iuran, verifikasi bukti transfer, dan kelola status pembayaran warga
          </p>
        </div>
        {currentUser?.role === 'admin' && (
          <div className="flex flex-nowrap items-center gap-2 sm:gap-2.5 shrink-0 max-w-full">
            <button 
              type="button"
              onClick={() => {
                setModalError('');
                setIsModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 bg-[#0088f8] hover:bg-[#0070e0] text-white px-3.5 sm:px-5 py-2.5 rounded-2xl font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 icon-3d-glyph shrink-0" />
              <span>Catat Pembayaran</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 bg-white dark:bg-[#18263d] hover:bg-slate-50 dark:hover:bg-[#1e2f4b] text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-700 px-3.5 sm:px-4 py-2.5 rounded-2xl font-bold transition-colors shadow-2xs cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 stroke-[2] text-[#0088f8] dark:text-[#60b5ff] shrink-0" />
              <span>Ekspor Data</span>
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold ${
          feedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
            : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="icon-btn-md hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Tutup"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      )}

      {/* Verifikasi Alert Banner for Admin */}
      {currentUser?.role === 'admin' && pendingPaymentsCount > 0 && filterStatus !== 'pending' && (
        <div className="bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-700/40 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <Icon3D icon={AlertTriangle} size="lg" variant="amber" />
            <div>
              <h2 className="font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 text-base sm:text-lg">
                Ada {pendingPaymentsCount} Iuran Perlu Verifikasi
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Periksa bukti transfer atau tindak lanjuti status pembayaran iuran warga.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilterStatus('pending');
              setFilterMonth(0);
            }}
            className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold rounded-2xl transition-colors shrink-0 cursor-pointer min-h-[44px] whitespace-nowrap"
          >
            Lihat Verifikasi ({pendingPaymentsCount})
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs overflow-hidden flex flex-col">
        {/* Status Filter Tabs & Period / Search Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#162339]/70 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            {/* Symmetrical Fitted 3-Tab Status Filter (Zero Horizontal Scroll) */}
            <LayoutGroup id="payments-status-tabs">
              <div
                role="tablist"
                aria-label="Filter status pembayaran"
                className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-[#18263d] rounded-2xl w-full lg:w-auto lg:inline-grid"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === 'all'}
                  onClick={() => setFilterStatus('all')}
                  className={`relative isolate px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-colors duration-150 inline-flex items-center justify-center whitespace-nowrap cursor-pointer min-h-[40px] tabular-nums min-w-0 ${
                    filterStatus === 'all'
                      ? 'text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {filterStatus === 'all' && (
                    <motion.span
                      layoutId="payments-status-pill"
                      transition={
                        shouldReduceMotion
                          ? { duration: 0.08 }
                          : { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 }
                      }
                      className="absolute inset-0 rounded-xl bg-white dark:bg-[#233554] shadow-xs -z-10"
                    />
                  )}
                  <span className="relative z-10 truncate">Semua ({payments.length})</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === 'pending'}
                  onClick={() => setFilterStatus('pending')}
                  className={`relative isolate px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-colors duration-150 inline-flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer min-h-[40px] tabular-nums min-w-0 ${
                    filterStatus === 'pending'
                      ? 'text-white'
                      : 'text-amber-800 dark:text-amber-400 hover:bg-amber-50/70 dark:hover:bg-amber-950/40'
                  }`}
                >
                  {filterStatus === 'pending' && (
                    <motion.span
                      layoutId="payments-status-pill"
                      transition={
                        shouldReduceMotion
                          ? { duration: 0.08 }
                          : { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 }
                      }
                      className="absolute inset-0 rounded-xl bg-amber-500 shadow-xs -z-10"
                    />
                  )}
                  <Hourglass className="w-3.5 h-3.5 icon-3d-glyph-soft relative z-10 shrink-0 hidden sm:inline-block" />
                  <span className="relative z-10 truncate">Verifikasi ({pendingPaymentsCount})</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === 'verified'}
                  onClick={() => setFilterStatus('verified')}
                  className={`relative isolate px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-colors duration-150 inline-flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer min-h-[40px] tabular-nums min-w-0 ${
                    filterStatus === 'verified'
                      ? 'text-white'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40'
                  }`}
                >
                  {filterStatus === 'verified' && (
                    <motion.span
                      layoutId="payments-status-pill"
                      transition={
                        shouldReduceMotion
                          ? { duration: 0.08 }
                          : { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 }
                      }
                      className="absolute inset-0 rounded-xl bg-emerald-600 shadow-xs -z-10"
                    />
                  )}
                  <CheckCircle2 className="w-3.5 h-3.5 icon-3d-glyph-soft relative z-10 shrink-0 hidden sm:inline-block" />
                  <span className="relative z-10 truncate">Selesai ({verifiedPaymentsCount})</span>
                </button>
              </div>
            </LayoutGroup>

            <div className="flex flex-wrap items-center gap-2.5">
              <select 
                value={filterMonth}
                onChange={(e) => setFilterMonth(Number(e.target.value))}
                className="flex-1 sm:flex-initial min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-[#18263d] text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] cursor-pointer min-h-[40px]"
              >
                <option value={0}>Semua Bulan</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>{getMonthName(i+1)}</option>
                ))}
              </select>
              <select 
                value={filterYear}
                onChange={(e) => setFilterYear(Number(e.target.value))}
                className="flex-1 sm:flex-initial min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-[#18263d] text-xs sm:text-sm font-bold text-[#0088f8] dark:text-[#60b5ff] focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] cursor-pointer min-h-[40px] tabular-nums"
              >
                <option value={0} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-[#111c2e] font-medium">Semua Tahun</option>
                {Array.from({ length: 22 }, (_, i) => currentYear - 1 + i).map(y => (
                  <option key={y} value={y} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-[#111c2e] font-medium">{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative w-full md:max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Cari nama, nomor rumah, no WA..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-[#18263d] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0088f8] focus:ring-2 focus:ring-[#0088f8]/20 transition-colors min-h-[42px]"
            />
          </div>
        </div>

        <motion.div
          key={filterStatus}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: shouldReduceMotion ? 0.08 : 0.25,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white dark:bg-[#162339] border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-300 text-sm">
                <th className="px-6 py-4 font-medium">Warga & Properti</th>
                <th className="px-6 py-4 font-medium">Periode</th>
                <th className="px-6 py-4 font-medium">Nominal</th>
                <th className="px-6 py-4 font-medium">Status & Bukti Transfer</th>
                <th className="px-6 py-4 font-medium text-right">Ubah Status & Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPayments.length > 0 ? (
                filteredPayments.map((payment) => {
                  const resident = residentMap.get(payment.residentId);
                  const normalizedStatus = normalizePaymentStatus(payment);
                  const isTertunda = normalizedStatus === 'tertunda';
                  const isPending = normalizedStatus === 'pending';
                  const isVerified = normalizedStatus === 'verified';

                  return (
                    <tr 
                      key={payment.id} 
                      className={`perf-table-row transition-colors ${
                        isTertunda 
                          ? 'bg-rose-50/20 dark:bg-rose-950/20 hover:bg-rose-50/40 dark:hover:bg-rose-950/35' 
                          : isPending 
                          ? 'bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/60 dark:hover:bg-amber-950/35' 
                          : 'hover:bg-slate-50/50 dark:hover:bg-[#18263d]/70'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 aspect-square rounded-xl bg-[#e8f4fd] dark:bg-[#152843] text-[#0088f8] dark:text-[#60b5ff] font-display font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden border border-blue-100 dark:border-blue-500/20">
                            {resident?.photoUrl ? (
                              <img
                                src={resident.photoUrl}
                                alt={resident.name}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{getInitials(resident?.name || 'Warga')}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{resident?.name || 'Warga (ID: ' + payment.residentId + ')'}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              {resident?.propertyType || 'Perumahan'} {resident?.block ? `Blok ${resident.block}` : ''} No. {resident?.houseNumber || '-'}
                            </div>
                            {resident?.phone && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                <span className="tabular-nums">{resident.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-[#18263d] text-slate-700 dark:text-slate-300">
                          {getMonthName(payment.month)} {payment.year}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-900 dark:text-slate-100 font-semibold tabular-nums">{formatIDR(payment.amount)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {safeFormatDate(payment.date)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isTertunda ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" /> Tertunda
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#e8f4fd] dark:bg-[#152843] text-[#0070e0] dark:text-[#60b5ff] border border-blue-200 dark:border-blue-500/30">
                              <Hourglass className="w-3.5 h-3.5 text-[#0088f8] dark:text-[#60b5ff]" /> Verifikasi
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
                            </span>
                          )}
                          
                          {payment.proofOfPayment && (
                            <button 
                              type="button"
                              onClick={() => {
                                setSelectedProof(payment);
                                setProofModalOpen(true);
                              }}
                              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#0088f8] dark:text-[#60b5ff] hover:text-[#0070e0] bg-[#e8f4fd] dark:bg-[#152843] hover:bg-blue-100 dark:hover:bg-[#1d395e] px-3.5 py-2 rounded-xl border border-blue-200/70 dark:border-blue-500/30 transition-colors cursor-pointer min-h-[40px] whitespace-nowrap"
                              title="Lihat Bukti Foto Transfer"
                            >
                              <FileImage className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                              <span>Bukti</span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {currentUser?.role === 'admin' && (
                            <>
                              <select
                                value={normalizedStatus}
                                onChange={(e) => handleStatusChange(payment, e.target.value as any)}
                                disabled={isProcessing}
                                className={`text-xs font-bold px-3 py-2 rounded-xl border focus:outline-none transition-colors cursor-pointer min-h-[40px] ${
                                  isTertunda
                                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-700/50 text-amber-800 dark:text-amber-300'
                                    : isVerified
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                                    : 'bg-slate-50 dark:bg-[#18263d] border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                                }`}
                                title="Ubah Status Pembayaran"
                              >
                                <option value="verified" className="bg-white dark:bg-[#111c2e] text-slate-900 dark:text-slate-100">Selesai (Lunas)</option>
                                <option value="tertunda" className="bg-white dark:bg-[#111c2e] text-slate-900 dark:text-slate-100">Tertunda</option>
                                {payment.proofOfPayment && (
                                  <option value="pending" className="bg-white dark:bg-[#111c2e] text-slate-900 dark:text-slate-100">Verifikasi</option>
                                )}
                              </select>

                              <button 
                                type="button"
                                onClick={() => setDeleteConfirmId(payment.id)}
                                className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100/70 dark:bg-[#18263d] hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                title="Hapus Pembayaran"
                              >
                                <Trash2 className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 bg-slate-50/30 dark:bg-[#162339]/40">
                    <div className="flex flex-col items-center gap-2">
                      <Icon3D icon={ReceiptText} size="lg" variant="slate" />
                      <p className="font-medium text-slate-600 dark:text-slate-300">Tidak ada catatan pembayaran untuk filter ini.</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Coba ubah filter bulan, tahun, status atau kata kunci pencarian.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {filteredPayments.length > 0 ? (
            filteredPayments.map(payment => {
              const resident = residentMap.get(payment.residentId);
              const normalizedStatus = normalizePaymentStatus(payment);
              const isTertunda = normalizedStatus === 'tertunda';
              const isPending = normalizedStatus === 'pending';

              return (
                <div 
                  key={payment.id} 
                  className={`perf-list-item p-4 flex flex-col gap-3 transition-colors ${
                    isTertunda ? 'bg-amber-50/20 dark:bg-amber-950/20' : isPending ? 'bg-amber-50/30 dark:bg-[#152843]/40' : 'hover:bg-slate-50/50 dark:hover:bg-[#18263d]/60'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 aspect-square rounded-xl bg-[#e8f4fd] dark:bg-[#152843] text-[#0088f8] dark:text-[#60b5ff] font-display font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden border border-blue-100 dark:border-blue-500/20">
                        {resident?.photoUrl ? (
                          <img
                            src={resident.photoUrl}
                            alt={resident.name}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{getInitials(resident?.name || 'Warga')}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-base truncate">{resident?.name || 'Warga'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {resident?.propertyType || 'Perumahan'} {resident?.block ? `Blok ${resident.block}` : ''} No. {resident?.houseNumber || '-'}
                        </div>
                        {resident?.phone && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                            <span className="tabular-nums">{resident.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatIDR(payment.amount)}</div>
                      <span className="inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-[#18263d] text-slate-700 dark:text-slate-300">
                        {getMonthName(payment.month)} {payment.year}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      {safeFormatDate(payment.date)}
                    </span>
                    <div className="flex items-center gap-2">
                      {isTertunda ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" /> Tertunda
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#e8f4fd] dark:bg-[#152843] text-[#0070e0] dark:text-[#60b5ff] border border-blue-200 dark:border-blue-500/30">
                          <Hourglass className="w-3.5 h-3.5 text-[#0088f8] dark:text-[#60b5ff]" /> Verifikasi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex-wrap">
                    {currentUser?.role === 'admin' && (
                      <select
                        value={normalizedStatus}
                        onChange={(e) => handleStatusChange(payment, e.target.value as any)}
                        disabled={isProcessing}
                        className="text-xs font-bold px-3 py-2 rounded-xl border bg-white dark:bg-[#18263d] border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none min-h-[40px]"
                      >
                        <option value="verified">Selesai (Lunas)</option>
                        <option value="tertunda">Tertunda</option>
                        {payment.proofOfPayment && <option value="pending">Verifikasi</option>}
                      </select>
                    )}

                    <div className="flex items-center gap-1.5 ml-auto">
                      {payment.proofOfPayment && (
                        <button 
                          type="button"
                          onClick={() => {
                            setSelectedProof(payment);
                            setProofModalOpen(true);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#0088f8] dark:text-[#60b5ff] bg-[#e8f4fd] dark:bg-[#152843] px-3.5 py-2 rounded-xl border border-blue-200/70 dark:border-blue-500/30 min-h-[40px] whitespace-nowrap cursor-pointer"
                        >
                          <FileImage className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                          <span>Bukti</span>
                        </button>
                      )}

                      {currentUser?.role === 'admin' && (
                        <button 
                          type="button"
                          onClick={() => setDeleteConfirmId(payment.id)}
                          className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100/70 dark:bg-[#18263d] hover:bg-rose-50 dark:hover:bg-rose-950/50"
                          title="Hapus Pembayaran"
                        >
                          <Trash2 className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              Tidak ada catatan pembayaran untuk filter ini.
            </div>
          )}
        </div>
        </motion.div>
      </div>

      {/* Modal View Proof */}
      {proofModalOpen && selectedProof && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 dark:bg-slate-950/90 sm:backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111c2e] dark:border dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#162339]">
              <div>
                <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">Bukti Transfer Pembayaran</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Periode {getMonthName(selectedProof.month)} {selectedProof.year} • {formatIDR(selectedProof.amount)}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setProofModalOpen(false)}
                className="icon-btn-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto bg-slate-900/5 dark:bg-[#0b1220] flex-1 flex flex-col items-center justify-center min-h-[250px]">
              {selectedProof.proofOfPayment ? (
                <img 
                  src={selectedProof.proofOfPayment} 
                  alt="Bukti Transfer" 
                  loading="lazy"
                  decoding="async"
                  className="max-w-full max-h-[60vh] object-contain rounded-2xl shadow-md border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada gambar bukti terlampir.</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#111c2e] flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${
                selectedProof.status === 'tertunda'
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300'
                  : selectedProof.status === 'pending'
                  ? 'bg-[#e8f4fd] dark:bg-[#152843] text-[#0070e0] dark:text-[#60b5ff]'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              }`}>
                Status: {
                  selectedProof.status === 'tertunda' 
                    ? 'Tertunda (Perlu Pembayaran)' 
                    : selectedProof.status === 'pending' 
                    ? 'Verifikasi' 
                    : 'Terverifikasi Selesai'
                }
              </span>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {currentUser?.role === 'admin' && selectedProof.status !== 'tertunda' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleStatusChange(selectedProof, 'tertunda');
                      setProofModalOpen(false);
                    }}
                    className="btn-secondary-action bg-amber-500 hover:bg-amber-600 text-white shadow-2xs"
                    title="Ubah status pembayaran menjadi Tertunda"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-white stroke-[2]" />
                    <span>Ubah ke Tertunda</span>
                  </button>
                )}

                {currentUser?.role === 'admin' && selectedProof.status !== 'verified' && (
                  <button 
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      handleStatusChange(selectedProof, 'verified');
                      setProofModalOpen(false);
                    }}
                    className="btn-secondary-action px-4 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4 stroke-[2]" />
                    <span>Verifikasi & Selesai</span>
                  </button>
                )}

                <button 
                  type="button"
                  onClick={() => setProofModalOpen(false)}
                  className="btn-secondary-action px-4 text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-[#18263d] hover:bg-slate-200/70 dark:hover:bg-[#1f304d]"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Add Manual Payment */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/55 dark:bg-slate-950/80 sm:backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111c2e] dark:border dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[100%] sm:max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-[#162339]">
              <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base sm:text-lg">Catat Pembayaran Manual</h3>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="icon-btn-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              {modalError && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Periode Bulan</label>
                  <select
                    value={formData.month}
                    onChange={(e) => setFormData({...formData, month: Number(e.target.value)})}
                    className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] bg-slate-50 dark:bg-[#18263d] text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-[#1f304d] transition-colors text-sm appearance-none min-h-[44px]"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i+1} value={i+1}>{getMonthName(i+1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Tahun</label>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData({...formData, year: Number(e.target.value)})}
                    className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] bg-slate-50 dark:bg-[#18263d] text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-[#1f304d] transition-colors text-sm appearance-none min-h-[44px]"
                  >
                    {Array.from({ length: 22 }, (_, i) => currentYear - 1 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Pilih Warga</label>
                <select
                  required
                  value={formData.residentId}
                  onChange={(e) => {
                    const rId = e.target.value;
                    const res = residentMap.get(rId);
                    setFormData({
                      ...formData, 
                      residentId: rId,
                      amount: res?.monthlyDues || 150000
                    });
                  }}
                  className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] bg-slate-50 dark:bg-[#18263d] text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-[#1f304d] transition-colors text-sm appearance-none min-h-[44px]"
                >
                  <option value="" disabled>-- Pilih Warga (Belum Bayar) --</option>
                  {unpaidResidents.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} - {r.propertyType} {r.block ? `Blok ${r.block}` : ''} No. {r.houseNumber} {r.phone ? `(${r.phone})` : ''}
                    </option>
                  ))}
                </select>
                {unpaidResidents.length === 0 && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">Semua warga sudah membayar untuk periode ini.</p>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nominal Iuran (Rp)</label>
                <input 
                  required
                  type="number"
                  min="0"
                  step="1000"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
                  className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] bg-slate-50 dark:bg-[#18263d] text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-[#1f304d] transition-colors text-sm tabular-nums min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Status Pembayaran</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                  className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] bg-slate-50 dark:bg-[#18263d] text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-[#1f304d] transition-colors text-sm appearance-none min-h-[44px]"
                >
                  <option value="verified">Selesai (Langsung Lunas)</option>
                  <option value="tertunda">Tertunda (Belum Lunas)</option>
                </select>
                {formData.status === 'tertunda' && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Iuran akan dicatat sebagai tagihan tertunda hingga pembayaran dilunasi.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Tanggal Pencatatan</label>
                <input 
                  required
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] bg-slate-50 dark:bg-[#18263d] text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-[#1f304d] transition-colors text-sm min-h-[44px]"
                />
              </div>
              
              <div className="pt-4 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-[#18263d] rounded-2xl transition-colors text-xs sm:text-sm cursor-pointer min-h-[44px]"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={!formData.residentId}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#0088f8] text-white font-bold rounded-2xl hover:bg-[#0070e0] transition-colors shadow-xs text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px]"
                >
                  Simpan Pembayaran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/65 dark:bg-slate-950/85 sm:backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111c2e] dark:border dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center">
            <Icon3D icon={Trash2} size="xl" variant="softRose" className="mx-auto mb-4" />
            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-slate-100 mb-2">Hapus Pembayaran?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Apakah Anda yakin ingin menghapus catatan pembayaran ini dari sistem?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2.5 font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#233554] rounded-2xl transition-colors w-full sm:w-auto text-xs sm:text-sm cursor-pointer min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={async () => {
                  const id = deleteConfirmId;
                  setIsProcessing(true);
                  try {
                    await deletePayment(id);
                    setDeleteConfirmId(null);
                    setFeedback({ type: 'success', text: 'Rekam pembayaran berhasil dihapus.' });
                    setTimeout(() => setFeedback(null), 3000);
                  } catch (err: unknown) {
                    setDeleteConfirmId(null);
                    setFeedback({
                      type: 'error',
                      text: translateErrorToIndonesian(err, 'Gagal menghapus catatan pembayaran.')
                    });
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                className="px-5 py-2.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-2xl transition-colors w-full sm:w-auto shadow-xs text-xs sm:text-sm cursor-pointer min-h-[44px] disabled:opacity-60"
              >
                {isProcessing ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Contextual CSV Export Modal */}
      <CsvExportModal
        mode="scoped"
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Ekspor Data"
        subtitle="Iuran warga · pilih cakupan data untuk diunduh"
        filteredOption={{
          label: 'Sesuai Filter Aktif',
          description: activeFilterSummary,
          count: filteredPayments.length,
        }}
        allOption={{
          label: 'Semua Data Iuran',
          description: 'Seluruh riwayat transaksi iuran warga tanpa filter.',
          count: payments.length,
        }}
        onExport={handleExportCsv}
      />
    </div>
  );
};
