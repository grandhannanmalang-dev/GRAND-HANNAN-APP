import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileImage,
  ImagePlus,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { useTheme } from '../ThemeContext';
import { Expense } from '../types';
import {
  compressImage,
  formatIDR,
  generateId,
  getMonthName,
  normalizePaymentStatus,
  safeFormatDate,
  safeTimeMs,
  translateErrorToIndonesian,
} from '../utils';
import {
  buildAllResidentsListCsv,
  buildExpensesCsv,
  buildPaymentsCsv,
  buildResidentsMatrixCsv,
  downloadCsvFile,
} from '../utils/csvExport';
import { CsvExportModal, CsvExportScope, CsvHubDataset } from './CsvExportModal';
import { Icon3D } from './Icon3D';
import { MonthlyDuesChart } from './MonthlyDuesChart';

export const Reports: React.FC = () => {
  const { residents, payments, expenses, currentUser, addExpense, deleteExpense } = useAppContext();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const shouldReduceMotion = useReducedMotion();

  const currentYear = new Date().getFullYear();

  const availableYears = React.useMemo(() => {
    const years = new Set<number>([currentYear]);
    payments.forEach((p) => {
      const y = Number(p.year);
      if (Number.isFinite(y) && y >= 2000 && y <= 2100) {
        years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [payments, currentYear]);

  const [selectedYear, setSelectedYear] = React.useState<number>(currentYear);
  const activeYear = availableYears.includes(selectedYear) ? selectedYear : currentYear;

  // Summary of selected year
  const {
    totalExpensesAllTime,
    currentBalance,
    totalYearCollected,
    sortedExpenses,
  } = React.useMemo(() => {
    const verified = payments.filter((p) => normalizePaymentStatus(p) === 'verified');
    const collectedAll = verified.reduce((sum, p) => sum + p.amount, 0);
    const expensesAll = expenses.reduce((sum, e) => sum + e.amount, 0);
    const yearCollected = verified
      .filter((p) => Number(p.year) === activeYear)
      .reduce((sum, p) => sum + p.amount, 0);
    const sorted = [...expenses].sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));
    return {
      totalExpensesAllTime: expensesAll,
      currentBalance: collectedAll - expensesAll,
      totalYearCollected: yearCollected,
      sortedExpenses: sorted,
    };
  }, [payments, expenses, activeYear]);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = React.useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [selectedExpenseProof, setSelectedExpenseProof] = React.useState<Expense | null>(null);

  const currentMonth = new Date().getMonth() + 1;

  const yearPayments = React.useMemo(
    () => payments.filter((p) => Number(p.year) === activeYear),
    [payments, activeYear]
  );

  const yearExpenses = React.useMemo(
    () =>
      expenses.filter((e) => {
        const y = Number(e.year) || new Date(e.date).getFullYear();
        return y === activeYear;
      }),
    [expenses, activeYear]
  );

  const handleExportCsv = (dataset: CsvHubDataset, scope: CsvExportScope) => {
    let csv = '';
    let filename = '';

    if (dataset === 'payments') {
      const targetPayments = scope === 'filtered' ? yearPayments : payments;
      csv = buildPaymentsCsv(targetPayments, residents);
      filename =
        scope === 'filtered'
          ? `grand-hannan-iuran-${activeYear}.csv`
          : 'grand-hannan-iuran-semua.csv';
    } else if (dataset === 'residents') {
      if (scope === 'filtered') {
        csv = buildResidentsMatrixCsv(residents, payments, activeYear);
        filename = `grand-hannan-warga-rekap-${activeYear}.csv`;
      } else {
        csv = buildAllResidentsListCsv(residents, payments, currentMonth, currentYear);
        filename = `grand-hannan-warga-${String(currentYear)}-${String(currentMonth).padStart(2, '0')}.csv`;
      }
    } else {
      const targetExpenses = scope === 'filtered' ? yearExpenses : expenses;
      csv = buildExpensesCsv(targetExpenses);
      filename =
        scope === 'filtered'
          ? `grand-hannan-pengeluaran-${activeYear}.csv`
          : 'grand-hannan-pengeluaran-semua.csv';
    }

    downloadCsvFile(filename, csv);
    setFeedback({ type: 'success', text: `File arsip "${filename}" berhasil diunduh.` });
    setTimeout(() => setFeedback(null), 4000);
  };

  const [expenseForm, setExpenseForm] = React.useState({
    description: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    proofPhoto: '',
  });
  const [proofFileName, setProofFileName] = React.useState('');
  const [isCompressingPhoto, setIsCompressingPhoto] = React.useState(false);
  const [isSavingExpense, setIsSavingExpense] = React.useState(false);
  const [modalError, setModalError] = React.useState('');
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const resetExpenseModal = () => {
    setExpenseForm({
      description: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      proofPhoto: '',
    });
    setProofFileName('');
    setModalError('');
    setIsCompressingPhoto(false);
    setIsSavingExpense(false);
  };

  const openExpenseModal = () => {
    resetExpenseModal();
    setIsExpenseModalOpen(true);
  };

  const closeExpenseModal = () => {
    setIsExpenseModalOpen(false);
    resetExpenseModal();
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setModalError('');
    setIsCompressingPhoto(true);
    try {
      const compressed = await compressImage(file, 1200, 0.75);
      setExpenseForm((prev) => ({ ...prev, proofPhoto: compressed }));
      setProofFileName(file.name);
    } catch (err) {
      setModalError(translateErrorToIndonesian(err, 'Gagal memproses foto bukti pengeluaran.'));
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const confirmDeleteExpense = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteExpense(deleteConfirmId);
      setDeleteConfirmId(null);
      setFeedback({ type: 'success', text: 'Catatan pengeluaran berhasil dihapus.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setDeleteConfirmId(null);
      setFeedback({
        type: 'error',
        text: translateErrorToIndonesian(err, 'Gagal menghapus catatan pengeluaran.'),
      });
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedDesc = expenseForm.description.trim();
    if (!trimmedDesc || expenseForm.amount <= 0) {
      setModalError('Mohon isi keterangan dan nominal pengeluaran yang valid.');
      return;
    }

    setModalError('');
    setIsSavingExpense(true);
    try {
      const dateObj = new Date(expenseForm.date);
      await addExpense({
        id: `exp_${generateId()}`,
        description: trimmedDesc,
        amount: Number(expenseForm.amount),
        date: dateObj.toISOString(),
        month: dateObj.getMonth() + 1,
        year: dateObj.getFullYear(),
        ...(expenseForm.proofPhoto ? { proofPhoto: expenseForm.proofPhoto } : {}),
      });

      closeExpenseModal();
      setFeedback({ type: 'success', text: 'Catatan pengeluaran berhasil disimpan.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setModalError(translateErrorToIndonesian(err, 'Gagal menyimpan catatan pengeluaran.'));
    } finally {
      setIsSavingExpense(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">Laporan Keuangan</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Pantau pemasukan, pengeluaran, dan bukti transaksi kas
          </p>
        </div>
        {currentUser?.role === 'admin' && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={openExpenseModal}
              className="inline-flex items-center justify-center gap-2 bg-[#800020] hover:bg-[#660019] dark:bg-[#9f1239] dark:hover:bg-[#881337] text-white px-5 py-2.5 rounded-2xl font-bold transition-all shadow-md shadow-[#800020]/25 active:scale-95 cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap shrink-0"
            >
              <Plus className="w-[1em] h-[1em] stroke-[2.5] icon-3d-glyph shrink-0" />
              <span>Catat Pengeluaran</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 bg-white dark:bg-[#18263d] hover:bg-slate-50 dark:hover:bg-[#1e2f4b] text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-2xl font-bold transition-colors shadow-2xs cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 stroke-[2] text-[#0088f8] dark:text-[#60b5ff]" />
              <span>Ekspor Laporan</span>
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
              : 'bg-[#fdf2f4] dark:bg-[#240b14] border-[#800020]/25 dark:border-rose-800/60 text-[#800020] dark:text-rose-300'
          }`}
        >
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
            aria-label="Tutup pemberitahuan"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <div className="bg-gradient-to-br from-[#0088f8] to-[#0070e0] dark:from-[#0f5bb5] dark:to-[#093e82] p-5 sm:p-6 rounded-3xl shadow-xs text-white relative overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-100 mb-2">Total Saldo Kas</p>
              <h3 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight tabular-nums">
                {formatIDR(currentBalance)}
              </h3>
            </div>
            <Icon3D icon={Wallet} size="md" variant="glass" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111c2e] p-5 sm:p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800/90 shadow-xs transition-colors overflow-hidden">
          <motion.div
            key={activeYear}
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.08 : 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Total Pemasukan ({activeYear})
            </p>
            <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight tabular-nums">
              {formatIDR(totalYearCollected)}
            </h3>
          </motion.div>
        </div>

        <div className="bg-[#fdf2f4] dark:bg-[#240b14] p-5 sm:p-6 rounded-3xl border border-[#800020]/20 dark:border-[#be123c]/30 shadow-xs transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#800020]/85 dark:text-rose-200/80 mb-2">
                Total Pengeluaran (Semua)
              </p>
              <h3 className="font-display text-2xl font-bold text-[#6b001b] dark:text-rose-100 tracking-tight tabular-nums">
                {formatIDR(totalExpensesAllTime)}
              </h3>
            </div>
            <Icon3D icon={Receipt} size="md" variant="maroon" />
          </div>
        </div>
      </div>

      <MonthlyDuesChart
        payments={payments}
        residents={residents}
        isDark={isDark}
        selectedYear={activeYear}
        availableYears={availableYears}
        onYearChange={setSelectedYear}
      />

      {/* Expenses Table */}
      <div className="bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs overflow-hidden transition-colors">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon3D icon={Receipt} size="sm" variant="softMaroon" />
            <div>
              <h2 className="text-base sm:text-lg font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Riwayat Pengeluaran
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daftar pengeluaran kas beserta foto bukti untuk transparansi warga
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#162339] border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                <th className="px-5 sm:px-6 py-3.5 font-semibold">Tanggal</th>
                <th className="px-5 sm:px-6 py-3.5 font-semibold">Keterangan</th>
                <th className="px-5 sm:px-6 py-3.5 font-semibold text-right">Nominal</th>
                <th className="px-5 sm:px-6 py-3.5 font-semibold text-center">Bukti</th>
                {currentUser?.role === 'admin' && (
                  <th className="px-5 sm:px-6 py-3.5 font-semibold text-right">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {sortedExpenses.length > 0 ? (
                sortedExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-[#18263d]/70 transition-colors"
                    >
                      <td className="px-5 sm:px-6 py-4 whitespace-nowrap">
                        <div className="text-slate-900 dark:text-slate-100 font-medium text-sm">
                          {safeFormatDate(expense.date, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </div>
                      </td>
                      <td className="px-5 sm:px-6 py-4 text-slate-700 dark:text-slate-300 text-sm">
                        {expense.description}
                      </td>
                      <td className="px-5 sm:px-6 py-4 text-right font-semibold text-[#800020] dark:text-rose-400 text-sm tabular-nums whitespace-nowrap">
                        -{formatIDR(expense.amount)}
                      </td>
                      <td className="px-5 sm:px-6 py-4 text-center whitespace-nowrap">
                        {expense.proofPhoto ? (
                          <button
                            type="button"
                            onClick={() => setSelectedExpenseProof(expense)}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#fdf2f4] dark:bg-[#2e0c16] text-[#800020] dark:text-rose-300 border border-[#800020]/20 dark:border-rose-500/30 hover:bg-[#fae3e8] dark:hover:bg-[#3d111e] transition-colors cursor-pointer min-h-[40px] whitespace-nowrap"
                          >
                            <FileImage className="w-3.5 h-3.5" />
                            <span>Lihat Bukti</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Tanpa foto</span>
                        )}
                      </td>
                      {currentUser?.role === 'admin' && (
                        <td className="px-5 sm:px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(expense.id)}
                            className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-[#800020] dark:hover:text-rose-400 bg-slate-100/70 dark:bg-[#18263d] hover:bg-[#fdf2f4] dark:hover:bg-[#2e0c16]"
                            title="Hapus Pengeluaran"
                          >
                            <Trash2 className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
              ) : (
                <tr>
                  <td
                    colSpan={currentUser?.role === 'admin' ? 5 : 4}
                    className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 text-sm"
                  >
                    Belum ada riwayat pengeluaran tercatat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense Modal (Maroon Theme + Optional Photo Upload) */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/55 dark:bg-black/80 sm:backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111c2e] rounded-3xl w-full max-w-md shadow-2xl border border-transparent dark:border-slate-800 flex flex-col max-h-[100%] sm:max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#800020]/15 dark:border-[#be123c]/25 flex items-center justify-between shrink-0 bg-[#fdf2f4] dark:bg-[#240b14]">
              <div className="flex items-center gap-3">
                <Icon3D icon={Receipt} size="md" variant="maroon" />
                <div>
                  <h3 className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-slate-100">
                    Catat Pengeluaran
                  </h3>
                  <p className="text-xs text-[#800020]/80 dark:text-rose-300/80 mt-0.5">
                    Saldo kas akan berkurang otomatis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeExpenseModal}
                className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-[#800020] dark:hover:text-rose-200 hover:bg-[#800020]/10 dark:hover:bg-rose-950/60"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="p-6 space-y-4 overflow-y-auto">
              {modalError && (
                <div className="px-3.5 py-2.5 rounded-2xl bg-[#fdf2f4] dark:bg-[#2e0c16] border border-[#800020]/25 dark:border-rose-700/40 text-xs font-semibold text-[#800020] dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Keterangan / Keperluan
                </label>
                <input
                  required
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  placeholder="Contoh: Perbaikan gerbang utama"
                  className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] dark:focus:ring-rose-500/25 dark:focus:border-rose-400 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1b2b45] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nominal (Rp)
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  value={expenseForm.amount || ''}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] dark:focus:ring-rose-500/25 dark:focus:border-rose-400 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1b2b45] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors text-sm tabular-nums min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tanggal Keluar
                </label>
                <input
                  required
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] dark:focus:ring-rose-500/25 dark:focus:border-rose-400 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1b2b45] text-slate-900 dark:text-slate-100 transition-colors text-sm min-h-[44px]"
                />
              </div>

              {/* Photo Upload for Resident Transparency */}
              <div>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Foto Bukti / Nota
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Opsional · Transparansi warga
                  </span>
                </div>

                {expenseForm.proofPhoto ? (
                  <div className="rounded-2xl border border-[#800020]/20 dark:border-rose-500/30 bg-[#fdf2f4]/60 dark:bg-[#240b14]/60 p-3 space-y-2.5">
                    <img
                      src={expenseForm.proofPhoto}
                      alt="Pratinjau bukti pengeluaran"
                      referrerPolicy="no-referrer"
                      className="w-full max-h-44 object-contain rounded-xl bg-white dark:bg-[#0b1220] border border-slate-200/80 dark:border-slate-800"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
                        {proofFileName || 'Foto bukti siap diunggah'}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#18263d] text-[#800020] dark:text-rose-300 border border-[#800020]/20 dark:border-rose-500/30 hover:bg-[#fdf2f4] dark:hover:bg-[#2e0c16] cursor-pointer transition-colors">
                          Ganti
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoSelect}
                            className="sr-only"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setExpenseForm((prev) => ({ ...prev, proofPhoto: '' }));
                            setProofFileName('');
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/60 cursor-pointer transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#800020]/25 dark:border-rose-500/30 bg-[#fdf2f4]/50 dark:bg-[#240b14]/40 hover:bg-[#fdf2f4] dark:hover:bg-[#2e0c16]/60 px-4 py-5 text-center cursor-pointer transition-colors">
                    {isCompressingPhoto ? (
                      <>
                        <Loader2 className="w-6 h-6 text-[#800020] dark:text-rose-400 animate-spin" />
                        <span className="text-xs font-semibold text-[#800020] dark:text-rose-300">
                          Mengompresi foto bukti...
                        </span>
                      </>
                    ) : (
                      <>
                        <Icon3D icon={ImagePlus} size="sm" variant="softMaroon" />
                        <div>
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Pilih foto struk, nota, atau kuitansi
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            JPG / PNG akan dioptimalkan otomatis agar cepat dimuat warga
                          </p>
                        </div>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isCompressingPhoto}
                      onChange={handlePhotoSelect}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={closeExpenseModal}
                  className="w-full sm:w-auto px-5 py-2.5 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-[#18263d] rounded-2xl transition-colors text-xs sm:text-sm cursor-pointer min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCompressingPhoto || isSavingExpense}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#800020] hover:bg-[#660019] dark:bg-[#9f1239] dark:hover:bg-[#881337] disabled:opacity-60 text-white font-bold rounded-2xl transition-colors shadow-xs text-xs sm:text-sm cursor-pointer min-h-[44px]"
                >
                  {isSavingExpense ? 'Menyimpan...' : 'Simpan Pengeluaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Proof Photo Preview Modal (Admin & Residents) */}
      {selectedExpenseProof && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 sm:p-6 bg-slate-900/65 dark:bg-black/85 sm:backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111c2e] rounded-3xl w-full max-w-lg shadow-2xl border border-transparent dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-[#fdf2f4] dark:bg-[#240b14] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Icon3D icon={FileImage} size="md" variant="softMaroon" />
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-slate-100">
                    Bukti Pengeluaran
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    Transparansi catatan kas paguyuban
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExpenseProof(null)}
                className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-[#800020] dark:hover:text-rose-200 hover:bg-[#800020]/10 dark:hover:bg-rose-950/60"
                aria-label="Tutup pratinjau bukti"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="rounded-2xl bg-slate-50 dark:bg-[#162339] border border-slate-200/70 dark:border-slate-800 px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {selectedExpenseProof.description}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {safeFormatDate(selectedExpenseProof.date, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <p className="text-sm sm:text-base font-display font-bold text-[#800020] dark:text-rose-400 tabular-nums shrink-0">
                  -{formatIDR(selectedExpenseProof.amount)}
                </p>
              </div>

              {selectedExpenseProof.proofPhoto ? (
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0b1220] p-2">
                  <img
                    src={selectedExpenseProof.proofPhoto}
                    alt={`Bukti pengeluaran: ${selectedExpenseProof.description}`}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[55vh] object-contain rounded-xl mx-auto"
                  />
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  Foto bukti tidak tersedia untuk catatan ini.
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedExpenseProof(null)}
                className="px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#1f304d] rounded-2xl transition-colors text-xs sm:text-sm cursor-pointer min-h-[44px]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/65 dark:bg-black/80 sm:backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111c2e] rounded-3xl w-full max-w-sm shadow-2xl border border-transparent dark:border-slate-800 p-6 text-center">
            <Icon3D icon={Trash2} size="xl" variant="softMaroon" className="mx-auto mb-4" />
            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-slate-100 mb-2">
              Hapus Pengeluaran?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Apakah Anda yakin ingin menghapus catatan pengeluaran ini? Saldo kas akan otomatis bertambah kembali.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2.5 font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#1f304d] rounded-2xl transition-colors w-full sm:w-auto text-xs sm:text-sm cursor-pointer min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteExpense}
                className="px-5 py-2.5 font-bold text-white bg-[#800020] hover:bg-[#660019] dark:bg-[#9f1239] dark:hover:bg-[#881337] rounded-2xl transition-colors w-full sm:w-auto shadow-xs text-xs sm:text-sm cursor-pointer min-h-[44px]"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Centralized CSV Export Hub Modal */}
      <CsvExportModal
        mode="hub"
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Ekspor Arsip Laporan CSV"
        subtitle="Unduh data keuangan dan warga untuk pengarsipan eksternal"
        datasets={[
          {
            id: 'payments',
            label: 'Data Iuran Warga',
            description: 'Riwayat transaksi iuran, nominal, dan status verifikasi',
            filteredLabel: `Tahun Terpilih (${activeYear})`,
            filteredDescription: `Seluruh catatan pembayaran iuran pada tahun ${activeYear}.`,
            filteredCount: yearPayments.length,
            allLabel: 'Semua Tahun',
            allDescription: 'Seluruh riwayat pembayaran iuran dari semua periode.',
            allCount: payments.length,
          },
          {
            id: 'residents',
            label: 'Daftar Warga & Status Iuran',
            description: 'Profil unit rumah/ruko beserta status pembayaran',
            filteredLabel: `Rekap 12 Bulan (${activeYear})`,
            filteredDescription: `Daftar seluruh warga disertai status iuran Januari–Desember ${activeYear}.`,
            filteredCount: residents.length,
            allLabel: `Status Bulan Ini (${getMonthName(currentMonth)} ${currentYear})`,
            allDescription: `Daftar seluruh warga beserta status iuran periode ${getMonthName(currentMonth)} ${currentYear}.`,
            allCount: residents.length,
          },
          {
            id: 'expenses',
            label: 'Catatan Pengeluaran Kas',
            description: 'Tanggal, keterangan belanja, nominal, dan status bukti',
            filteredLabel: `Tahun Terpilih (${activeYear})`,
            filteredDescription: `Seluruh catatan pengeluaran kas pada tahun ${activeYear}.`,
            filteredCount: yearExpenses.length,
            allLabel: 'Semua Tahun',
            allDescription: 'Seluruh riwayat catatan pengeluaran kas paguyuban.',
            allCount: expenses.length,
          },
        ]}
        onExport={handleExportCsv}
      />
    </div>
  );
};
