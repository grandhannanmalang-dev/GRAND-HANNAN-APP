import React, { useMemo, useState, useRef } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'motion/react';
import { useAppContext } from '../AppContext';
import {
  Plus,
  Search,
  SearchX,
  CheckCircle2,
  Clock,
  Hourglass,
  AlertTriangle,
  Trash2,
  Pencil,
  Phone,
  LayoutList,
  Grid3X3,
  Loader2,
  Download,
  X
} from 'lucide-react';
import {
  generateId,
  formatIDR,
  getMonthName,
  getInitials,
  getResidentPaymentSummary,
  resolveResidentPaymentForMonth,
  buildYearPaymentLookupMap,
  normalizePaymentStatus,
  translateErrorToIndonesian,
  validateResidentField,
  validateResidentForm,
  ResidentFormField,
  ResidentFormValues,
  ResidentFormErrors
} from '../utils';
import {
  buildAllResidentsListCsv,
  buildResidentsListCsv,
  buildResidentsMatrixCsv,
  downloadCsvFile,
  sanitizeFilenamePart
} from '../utils/csvExport';
import { Resident } from '../types';
import { CsvExportModal, CsvExportScope } from './CsvExportModal';
import { Icon3D } from './Icon3D';

type StatusTab = 'all' | 'unpaid' | 'paid';
type ViewModeTab = 'list' | 'matrix';

export const Residents: React.FC = () => {
  const {
    residents,
    syncingResidentName,
    hasPendingResidentSync,
    payments,
    addResident,
    updateResident,
    deleteResident,
    addPayment,
    updatePayment,
    currentUser
  } = useAppContext();

  const isFirestoreSyncing = Boolean(syncingResidentName || hasPendingResidentSync);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [statusFilter, setStatusFilter] = useState<StatusTab>('all');
  const [viewMode, setViewMode] = useState<ViewModeTab>('list');
  const shouldReduceMotion = useReducedMotion();

  const stageTransition = shouldReduceMotion
    ? { duration: 0.08 }
    : { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const };

  const springCapsuleTransition = shouldReduceMotion
    ? { duration: 0.08 }
    : { type: 'spring' as const, stiffness: 460, damping: 34, mass: 0.8 };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ResidentFormErrors>({});
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyResidentId, setBusyResidentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewResidentPhoto, setPreviewResidentPhoto] = useState<{ name: string; url: string; unitLabel: string } | null>(null);

  const initialFormValues: ResidentFormValues = {
    name: '',
    propertyType: 'Perumahan',
    block: '',
    houseNumber: '',
    phone: '',
    monthlyDues: '',
    idLogin: '',
    password: '',
  };

  const [formData, setFormData] = useState<ResidentFormValues>(initialFormValues);

  const fieldRefs = useRef<Partial<Record<ResidentFormField, HTMLInputElement | HTMLSelectElement | null>>>({});

  const setFieldRef = (field: ResidentFormField) => (el: HTMLInputElement | HTMLSelectElement | null) => {
    fieldRefs.current[field] = el;
  };

  const summary = useMemo(
    () => getResidentPaymentSummary(residents, payments, selectedMonth, selectedYear),
    [residents, payments, selectedMonth, selectedYear]
  );

  const yearPaymentMap = useMemo(
    () => (viewMode === 'matrix' ? buildYearPaymentLookupMap(payments, selectedYear) : new Map()),
    [viewMode, payments, selectedYear]
  );

  const filteredEntries = useMemo(() => {
    const trimmedSearch = searchTerm.toLowerCase().trim();
    const tokens = trimmedSearch ? trimmedSearch.split(/\s+/).filter(Boolean) : [];

    return summary.entries.filter(({ resident, status }) => {
      if (statusFilter === 'paid' && status !== 'verified') return false;
      if (statusFilter === 'unpaid' && status === 'verified') return false;

      if (tokens.length > 0) {
        const block = (resident.block || '').trim();
        const house = (resident.houseNumber || '').trim();
        const searchableText = [
          resident.name,
          resident.propertyType || 'Perumahan',
          block ? `blok ${block}` : '',
          block,
          house ? `no ${house}` : '',
          house ? `no. ${house}` : '',
          house,
          block && house ? `${block}${house}` : '',
          block && house ? `${block}-${house}` : '',
          resident.phone || '',
        ]
          .join(' ')
          .toLowerCase();

        return tokens.every((token) => searchableText.includes(token));
      }
      return true;
    });
  }, [summary.entries, statusFilter, searchTerm]);

  const paidPercent = residents.length > 0 ? Math.round((summary.paid.length / residents.length) * 100) : 0;

  const activeFilterSummary = useMemo(() => {
    const statusLabel =
      statusFilter === 'paid'
        ? 'Selesai (Lunas)'
        : statusFilter === 'unpaid'
        ? 'Belum Bayar'
        : 'Semua Status';
    const modeLabel =
      viewMode === 'matrix'
        ? `Rekap 12 Bulan ${selectedYear}`
        : `${getMonthName(selectedMonth)} ${selectedYear}`;
    const parts = [statusLabel, modeLabel];
    if (searchTerm.trim()) {
      parts.push(`Cari: "${searchTerm.trim()}"`);
    }
    return parts.join(' · ');
  }, [statusFilter, viewMode, selectedMonth, selectedYear, searchTerm]);

  const handleExportCsv = (scope: CsvExportScope) => {
    let csv = '';
    let filename = '';

    if (viewMode === 'matrix') {
      const targetResidents =
        scope === 'filtered' ? filteredEntries.map((e) => e.resident) : residents;
      csv = buildResidentsMatrixCsv(targetResidents, payments, selectedYear);
      filename =
        scope === 'filtered'
          ? `grand-hannan-warga-rekap-${selectedYear}-${sanitizeFilenamePart(statusFilter)}.csv`
          : `grand-hannan-warga-rekap-${selectedYear}-semua.csv`;
    } else {
      if (scope === 'filtered') {
        csv = buildResidentsListCsv(filteredEntries, selectedMonth, selectedYear);
        filename = `grand-hannan-warga-${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${sanitizeFilenamePart(statusFilter)}.csv`;
      } else {
        csv = buildAllResidentsListCsv(residents, payments, selectedMonth, selectedYear);
        filename = `grand-hannan-warga-${selectedYear}-${String(selectedMonth).padStart(2, '0')}-semua.csv`;
      }
    }

    downloadCsvFile(filename, csv);
    setFeedbackMsg({ type: 'success', text: `File arsip "${filename}" berhasil diunduh.` });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setFormError('');
    setFieldErrors({});
    setFormData(initialFormValues);
    setIsModalOpen(true);
  };

  const openEditModal = (resident: Resident) => {
    setIsEditMode(true);
    setEditingId(resident.id);
    setFormError('');
    setFieldErrors({});
    setFormData({
      name: resident.name,
      propertyType: resident.propertyType,
      block: resident.block || '',
      houseNumber: resident.houseNumber,
      phone: resident.phone || '',
      monthlyDues: resident.monthlyDues ? String(resident.monthlyDues) : '',
      idLogin: '',
      password: '',
    });
    setIsModalOpen(true);
  };

  const handleFieldChange = (field: ResidentFormField, value: string) => {
    const nextValues: ResidentFormValues = {
      ...formData,
      [field]: field === 'propertyType' ? (value as 'Perumahan' | 'Ruko') : value,
    };
    setFormData(nextValues);
    if (formError) setFormError('');

    const validationOptions = { isEditMode, editingId, existingResidents: residents };
    setFieldErrors((prev) => {
      const updated = { ...prev };
      if (prev[field]) {
        const nextErr = validateResidentField(field, nextValues, validationOptions);
        if (nextErr) {
          updated[field] = nextErr;
        } else {
          delete updated[field];
        }
      }
      if ((field === 'propertyType' || field === 'block') && prev.houseNumber) {
        const houseErr = validateResidentField('houseNumber', nextValues, validationOptions);
        if (houseErr) {
          updated.houseNumber = houseErr;
        } else {
          delete updated.houseNumber;
        }
      }
      return updated;
    });
  };

  const handleFieldBlur = (field: ResidentFormField) => {
    const err = validateResidentField(field, formData, {
      isEditMode,
      editingId,
      existingResidents: residents,
    });
    setFieldErrors((prev) => {
      const updated = { ...prev };
      if (err) {
        updated[field] = err;
      } else {
        delete updated[field];
      }
      return updated;
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteResident(deleteConfirmId);
      setDeleteConfirmId(null);
      setFeedbackMsg({ type: 'success', text: 'Data warga berhasil dihapus dari cloud.' });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: unknown) {
      setDeleteConfirmId(null);
      setFeedbackMsg({
        type: 'error',
        text: translateErrorToIndonesian(err, 'Gagal menghapus data warga dari cloud.'),
      });
      setTimeout(() => setFeedbackMsg(null), 5000);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    const errors = validateResidentForm(formData, {
      isEditMode,
      editingId,
      existingResidents: residents,
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const fieldOrder: ResidentFormField[] = [
        'name',
        'propertyType',
        'block',
        'houseNumber',
        'monthlyDues',
        'phone',
        'idLogin',
        'password',
      ];
      const firstInvalid = fieldOrder.find((f) => errors[f]);
      if (firstInvalid) {
        fieldRefs.current[firstInvalid]?.focus();
      }
      return;
    }

    setFieldErrors({});
    const trimmedName = formData.name.trim();
    const trimmedBlock = formData.block.trim();
    const trimmedHouse = formData.houseNumber.trim();
    const trimmedPhone = formData.phone.trim();
    const trimmedIdLogin = formData.idLogin.trim();
    const trimmedPassword = formData.password.trim();
    const duesAmount = Number(formData.monthlyDues.trim());

    setIsSubmitting(true);
    try {
      if (isEditMode && editingId) {
        await updateResident(
          editingId,
          {
            name: trimmedName,
            propertyType: formData.propertyType,
            block: trimmedBlock,
            houseNumber: trimmedHouse,
            phone: trimmedPhone,
            monthlyDues: duesAmount,
          },
          trimmedPassword || undefined
        );
      } else {
        const newResident: Resident = {
          id: `r_${generateId()}`,
          name: trimmedName,
          propertyType: formData.propertyType,
          ...(trimmedBlock ? { block: trimmedBlock } : {}),
          houseNumber: trimmedHouse,
          ...(trimmedPhone ? { phone: trimmedPhone } : {}),
          joinDate: new Date().toISOString().split('T')[0],
          monthlyDues: duesAmount,
        };
        await addResident(newResident, trimmedIdLogin, trimmedPassword);
      }
      setIsModalOpen(false);
      setFormData(initialFormValues);
      setFieldErrors({});
      if (!isEditMode) {
        setStatusFilter('all');
        setSearchTerm('');
      }
      setFeedbackMsg({
        type: 'success',
        text: isEditMode
          ? `Data warga "${trimmedName}" berhasil diperbarui.`
          : `Warga baru "${trimmedName}" berhasil ditambahkan.`,
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: unknown) {
      const msg = translateErrorToIndonesian(
        err,
        `Gagal ${isEditMode ? 'mengubah' : 'menambahkan'} data warga.`
      );
      if (msg.toLowerCase().includes('id pengguna')) {
        setFieldErrors((prev) => ({ ...prev, idLogin: msg }));
        fieldRefs.current.idLogin?.focus();
      } else {
        setFormError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickMarkPaid = async (resident: Resident) => {
    if (currentUser?.role !== 'admin') return;
    setBusyResidentId(resident.id);
    try {
      const existing = resolveResidentPaymentForMonth(payments, resident.id, selectedMonth, selectedYear);
      if (existing) {
        await updatePayment(existing.id, { status: 'verified' });
      } else {
        await addPayment({
          id: `p_${generateId()}`,
          residentId: resident.id,
          amount: resident.monthlyDues || 150000,
          month: selectedMonth,
          year: selectedYear,
          date: new Date().toISOString(),
          status: 'verified',
        });
      }
      setFeedbackMsg({
        type: 'success',
        text: `Iuran ${resident.name} periode ${getMonthName(selectedMonth)} ${selectedYear} ditandai lunas.`,
      });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: unknown) {
      setFeedbackMsg({
        type: 'error',
        text: translateErrorToIndonesian(err, 'Gagal memperbarui status pembayaran.'),
      });
      setTimeout(() => setFeedbackMsg(null), 5000);
    } finally {
      setBusyResidentId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">Data & Status Warga</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Pantau daftar warga yang sudah dan belum membayar secara praktis
          </p>
        </div>
        {currentUser?.role === 'admin' && (
          <div className="flex flex-nowrap items-center gap-2 sm:gap-2.5 shrink-0 max-w-full">
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 bg-[#0088f8] hover:bg-[#0070e0] text-white px-3.5 sm:px-5 py-2.5 rounded-2xl font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer text-xs sm:text-sm min-h-[44px] whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 icon-3d-glyph shrink-0" />
              <span>Tambah Warga</span>
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

      {isFirestoreSyncing && (
        <motion.div
          key="resident-sync-status"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#e8f4fd] dark:bg-[#152843] border border-blue-200/90 dark:border-blue-500/30 text-[#0070e0] dark:text-[#60b5ff] text-xs sm:text-sm font-semibold shadow-2xs"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Loader2 className="w-4 h-4 animate-spin text-[#0088f8] dark:text-[#60b5ff] shrink-0" />
            <span className="truncate">
              {syncingResidentName
                ? `Menyinkronkan "${syncingResidentName}" ke Firestore...`
                : 'Menyinkronkan data warga ke Firestore...'}
            </span>
          </div>
          <span className="text-[11px] font-bold text-[#0088f8] dark:text-[#60b5ff] whitespace-nowrap shrink-0">
            Sinkronisasi
          </span>
        </motion.div>
      )}

      {feedbackMsg && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-xs sm:text-sm font-semibold ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="icon-btn-md hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Tutup pesan"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs overflow-hidden flex flex-col">
        {/* Top Progress & Period Selector */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#162339]/70 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Fitted 3-Tab Segmented Status Filter (Zero Horizontal Scroll) */}
            <LayoutGroup id="residents-status-tabs">
              <div
                role="tablist"
                aria-label="Filter status pembayaran warga"
                className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-[#18263d] rounded-2xl w-full lg:w-auto lg:inline-grid"
              >
                {(
                  [
                    {
                      id: 'all' as StatusTab,
                      label: `Semua (${residents.length})`,
                      activeClass: 'text-slate-900 dark:text-slate-100',
                      inactiveClass: 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
                      pillBg: 'bg-white dark:bg-[#233554] shadow-xs',
                    },
                    {
                      id: 'unpaid' as StatusTab,
                      label: `Belum Bayar (${summary.notPaidYet.length + summary.pending.length})`,
                      activeClass: 'text-white',
                      inactiveClass: 'text-rose-700 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/40',
                      pillBg: 'bg-rose-600 shadow-xs',
                    },
                    {
                      id: 'paid' as StatusTab,
                      label: `Selesai (${summary.paid.length})`,
                      activeClass: 'text-white',
                      inactiveClass: 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40',
                      pillBg: 'bg-emerald-600 shadow-xs',
                    },
                  ] as const
                ).map((tab) => {
                  const isActive = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setStatusFilter(tab.id)}
                      className={`relative isolate px-2 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-colors duration-150 inline-flex items-center justify-center whitespace-nowrap cursor-pointer min-h-[40px] tabular-nums min-w-0 ${
                        isActive ? tab.activeClass : tab.inactiveClass
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="residents-status-pill"
                          transition={springCapsuleTransition}
                          className={`absolute inset-0 rounded-xl -z-10 ${tab.pillBg}`}
                        />
                      )}
                      <span className="relative z-10 truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>

            {/* Period + Search + View Switcher */}
            <div className="flex flex-wrap items-center gap-2.5">
              {viewMode === 'list' && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-[#18263d] text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] cursor-pointer min-h-[40px]"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
                  ))}
                </select>
              )}

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-[#18263d] text-xs sm:text-sm font-bold text-[#0088f8] dark:text-[#60b5ff] focus:outline-none focus:ring-2 focus:ring-[#0088f8]/20 focus:border-[#0088f8] cursor-pointer min-h-[40px] tabular-nums"
              >
                {Array.from({ length: 22 }, (_, i) => currentYear - 1 + i).map(y => (
                  <option key={y} value={y} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-[#111c2e] font-medium">{y}</option>
                ))}
              </select>

              {/* View Mode Toggle with Sliding Spring Capsule */}
              <LayoutGroup id="residents-view-tabs">
                <div
                  role="tablist"
                  aria-label="Mode tampilan daftar warga"
                  className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#18263d] rounded-2xl"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'list'}
                    onClick={() => setViewMode('list')}
                    className={`relative isolate inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer whitespace-nowrap min-h-[40px] ${
                      viewMode === 'list' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="Tampilan Daftar Praktis"
                  >
                    {viewMode === 'list' && (
                      <motion.span
                        layoutId="residents-view-pill"
                        transition={springCapsuleTransition}
                        className="absolute inset-0 rounded-xl bg-white dark:bg-[#233554] shadow-2xs -z-10"
                      />
                    )}
                    <LayoutList className="w-4 h-4 icon-3d-glyph-soft relative z-10" />
                    <span className="hidden sm:inline relative z-10">Praktis</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'matrix'}
                    onClick={() => setViewMode('matrix')}
                    className={`relative isolate inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer whitespace-nowrap min-h-[40px] ${
                      viewMode === 'matrix' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="Tampilan Rekap 12 Bulan"
                  >
                    {viewMode === 'matrix' && (
                      <motion.span
                        layoutId="residents-view-pill"
                        transition={springCapsuleTransition}
                        className="absolute inset-0 rounded-xl bg-white dark:bg-[#233554] shadow-2xs -z-10"
                      />
                    )}
                    <Grid3X3 className="w-4 h-4 icon-3d-glyph-soft relative z-10" />
                    <span className="hidden sm:inline relative z-10">12 Bulan</span>
                  </button>
                </div>
              </LayoutGroup>
            </div>
          </div>

          {/* Search & Progress Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2.5 w-full md:max-w-md">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  id="resident-search"
                  type="text"
                  aria-label="Cari data warga berdasarkan nama atau nomor rumah"
                  placeholder="Cari nama warga atau nomor rumah..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-9 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-[#18263d] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0088f8] focus:ring-2 focus:ring-[#0088f8]/20 text-sm transition-colors min-h-[42px]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Hapus pencarian"
                    title="Hapus pencarian"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 aspect-square rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4 stroke-[2]" />
                  </button>
                )}
              </div>

              {searchTerm.trim() && (
                <span className="shrink-0 px-2.5 py-1 rounded-xl bg-[#e8f4fd] dark:bg-[#152843] text-[#0070e0] dark:text-[#60b5ff] text-xs font-bold tabular-nums border border-blue-200/70 dark:border-blue-500/30">
                  {filteredEntries.length} hasil
                </span>
              )}
            </div>

            {viewMode === 'list' && residents.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                <span className="font-medium">
                  {getMonthName(selectedMonth)} {selectedYear}: <strong className="text-slate-900 dark:text-slate-100">{summary.paid.length}/{residents.length}</strong> Lunas
                </span>
                <div className="w-28 h-2 bg-slate-200 dark:bg-[#0b1220] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0088f8] rounded-full transition-all duration-300"
                    style={{ width: `${paidPercent}%` }}
                  />
                </div>
                <span className="font-bold text-[#0088f8] dark:text-[#60b5ff]">{paidPercent}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Animated Content Transition Stage (Non-blocking 250ms pure fade) */}
        <div>
          {viewMode === 'list' ? (
            /* VIEW 1: MODERN PRACTICAL LIST VIEW */
            <motion.div
              key={`view-list-${viewMode}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={stageTransition}
            >
              <motion.div
                key={`list-${statusFilter}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={stageTransition}
                className="p-4 sm:p-5"
              >
                    {filteredEntries.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {filteredEntries.map(({ resident, payment, status }) => {
                          const isBusy = busyResidentId === resident.id;
                          const unitLabel = `${resident.propertyType || 'Perumahan'}${resident.block ? ` Blok ${resident.block}` : ''} No. ${resident.houseNumber}`;

                          return (
                            <div
                              key={resident.id}
                              className={`perf-list-item p-4 rounded-2xl border transition-colors flex flex-col justify-between gap-3.5 ${
                                status === 'verified'
                                  ? 'bg-white dark:bg-[#162339]/80 border-slate-200/80 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-500/40'
                                  : status === 'pending'
                                  ? 'bg-blue-50/30 dark:bg-[#152843]/50 border-blue-200/80 dark:border-blue-500/30'
                                  : status === 'tertunda'
                                  ? 'bg-amber-50/35 dark:bg-amber-950/25 border-amber-200/90 dark:border-amber-700/40'
                                  : 'bg-rose-50/25 dark:bg-rose-950/25 border-rose-200/80 dark:border-rose-700/40'
                              }`}
                            >
                      {/* Top Row: Avatar + Resident Info + Status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {resident.photoUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewResidentPhoto({
                                  name: resident.name,
                                  url: resident.photoUrl!,
                                  unitLabel,
                                })
                              }
                              title={`Lihat foto profil ${resident.name}`}
                              className="w-12 h-12 aspect-square rounded-2xl bg-[#e8f4fd] dark:bg-[#152843] flex items-center justify-center shrink-0 overflow-hidden border border-blue-100 dark:border-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                            >
                              <img
                                src={resident.photoUrl}
                                alt={resident.name}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="w-12 h-12 aspect-square rounded-2xl bg-[#e8f4fd] dark:bg-[#152843] text-[#0088f8] dark:text-[#60b5ff] font-display font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden border border-blue-100 dark:border-blue-500/20">
                              <span>{getInitials(resident.name)}</span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base leading-snug truncate">
                              {resident.name}
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">{unitLabel}</p>
                            {resident.phone && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 tabular-nums">
                                <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                <span>{resident.phone}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Status Label */}
                        <div className="shrink-0">
                          {status === 'verified' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                              <CheckCircle2 className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                              <span>Sudah Bayar</span>
                            </span>
                          ) : status === 'pending' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#e8f4fd] dark:bg-[#152843] text-[#0070e0] dark:text-[#60b5ff] border border-blue-200 dark:border-blue-500/30">
                              <Hourglass className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                              <span>Verifikasi</span>
                            </span>
                          ) : status === 'tertunda' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 icon-3d-glyph-soft" />
                              <span>Tertunda</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                              <Clock className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                              <span>Belum Bayar</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Row: Dues Amount + Contextual Actions */}
                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                        <div>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Iuran {getMonthName(selectedMonth)}</span>
                          <p className="font-bold text-slate-900 dark:text-slate-100 text-sm tabular-nums">
                            {formatIDR(payment?.amount || resident.monthlyDues || 150000)}
                          </p>
                        </div>

                        {currentUser?.role === 'admin' && (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {(status === 'unpaid' || status === 'tertunda') && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickMarkPaid(resident)}
                                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 min-h-[40px] whitespace-nowrap"
                                title="Tandai Sudah Bayar Bulan Ini"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 icon-3d-glyph" />
                                <span>{isBusy ? 'Menyimpan...' : 'Tandai Lunas'}</span>
                              </button>
                            )}

                            {status === 'pending' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickMarkPaid(resident)}
                                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 min-h-[40px] whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 icon-3d-glyph" />
                                <span>{isBusy ? 'Menyimpan...' : 'Verifikasi Lunas'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openEditModal(resident)}
                              className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-[#0088f8] dark:hover:text-[#60b5ff] bg-slate-100/70 dark:bg-[#18263d] hover:bg-[#e8f4fd] dark:hover:bg-[#1e3554]"
                              title="Edit Warga"
                            >
                              <Pencil className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(resident.id)}
                              className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100/70 dark:bg-[#18263d] hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              title="Hapus Warga"
                            >
                              <Trash2 className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                <div className="flex flex-col items-center justify-center gap-2">
                  <Icon3D icon={SearchX} size="lg" variant="slate" className="mb-1" />
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    {searchTerm.trim()
                      ? `Tidak ada warga yang cocok dengan "${searchTerm.trim()}".`
                      : 'Tidak ada data warga untuk filter ini.'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Coba ubah kata kunci pencarian (nama atau nomor rumah) atau pilih tab status lainnya.
                  </p>
                  {searchTerm.trim() && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="mt-2 px-4 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#233554] text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Reset Pencarian
                    </button>
                  )}
                </div>
              </div>
            )}
              </motion.div>
            </motion.div>
          ) : (
            /* VIEW 2: 12-MONTH RECAP MATRIX (WITH FIXED STATUS LOGIC) */
            <motion.div
              key={`view-matrix-${viewMode}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={stageTransition}
            >
              <motion.div
                key={`matrix-${statusFilter}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={stageTransition}
                className="overflow-x-auto w-full pb-4"
              >
                    <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#162339] border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs">
                  <th className="px-4 py-3.5 font-semibold min-w-[180px] sticky left-0 bg-slate-50 dark:bg-[#162339] z-10 border-r border-slate-100 dark:border-slate-800 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]">
                    Identitas Warga
                  </th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th key={i + 1} className="px-1.5 py-3.5 font-semibold text-center min-w-[44px]">
                      {new Date(0, i).toLocaleString('id-ID', { month: 'short' })}
                    </th>
                  ))}
                  {currentUser?.role === 'admin' && (
                    <th className="px-4 py-3.5 font-semibold text-right sticky right-0 bg-slate-50 dark:bg-[#162339] z-10 border-l border-slate-100 dark:border-slate-800 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.35)]">
                      Aksi
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEntries.length > 0 ? (
                  filteredEntries.map(({ resident }) => (
                    <tr key={resident.id} className="perf-table-row hover:bg-slate-50/80 dark:hover:bg-[#18263d]/70 transition-colors group">
                      <td className="px-4 py-3 sticky left-0 bg-white dark:bg-[#111c2e] group-hover:bg-slate-50 dark:group-hover:bg-[#18263d] z-10 border-r border-slate-100 dark:border-slate-800 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)] transition-colors max-w-[210px]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 aspect-square rounded-xl bg-[#e8f4fd] dark:bg-[#152843] text-[#0088f8] dark:text-[#60b5ff] font-display font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                            {resident.photoUrl ? (
                              <img src={resident.photoUrl} alt={resident.name} referrerPolicy="no-referrer" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            ) : (
                              <span>{getInitials(resident.name)}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{resident.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {resident.propertyType || 'Perumahan'} · No. {resident.houseNumber}
                            </div>
                          </div>
                        </div>
                      </td>

                      {Array.from({ length: 12 }, (_, i) => {
                        const month = i + 1;
                        const paymentThisMonth = yearPaymentMap.get(`${resident.id}_${month}`);
                        const status = paymentThisMonth ? normalizePaymentStatus(paymentThisMonth) : 'unpaid';

                        return (
                          <td key={month} className="px-1 py-2 text-center border-r border-slate-50 dark:border-slate-800/60 last:border-r-0">
                            {status === 'verified' ? (
                              <div className="flex justify-center" title={`Sudah Bayar (Lunas) - ${getMonthName(month)} ${selectedYear}`}>
                                <div className="w-8 h-8 aspect-square rounded-xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200/80 dark:border-emerald-700/50 flex items-center justify-center shrink-0">
                                  <CheckCircle2 className="w-5 h-5 stroke-[2] text-emerald-600 dark:text-emerald-400" />
                                </div>
                              </div>
                            ) : status === 'pending' ? (
                              <div className="flex justify-center" title={`Menunggu Verifikasi - ${getMonthName(month)} ${selectedYear}`}>
                                <div className="w-8 h-8 aspect-square rounded-xl bg-blue-50 dark:bg-[#152843] border border-blue-200/80 dark:border-blue-500/40 flex items-center justify-center shrink-0">
                                  <Hourglass className="w-5 h-5 stroke-[2] text-[#0088f8] dark:text-[#60b5ff]" />
                                </div>
                              </div>
                            ) : status === 'tertunda' ? (
                              <div className="flex justify-center" title={`Tertunda (Belum Lunas) - ${getMonthName(month)} ${selectedYear}`}>
                                <div className="w-8 h-8 aspect-square rounded-xl bg-amber-50 dark:bg-amber-950/80 border border-amber-200/80 dark:border-amber-700/50 flex items-center justify-center shrink-0">
                                  <AlertTriangle className="w-5 h-5 stroke-[2] text-amber-700 dark:text-amber-400" />
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-center" title={`Belum Bayar - ${getMonthName(month)} ${selectedYear}`}>
                                <div className="w-8 h-8 aspect-square rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200/80 dark:border-rose-700/50 flex items-center justify-center shrink-0">
                                  <Clock className="w-5 h-5 stroke-[2] text-rose-500 dark:text-rose-400" />
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {currentUser?.role === 'admin' && (
                        <td className="px-4 py-3 text-right sticky right-0 bg-white dark:bg-[#111c2e] group-hover:bg-slate-50 dark:group-hover:bg-[#18263d] z-10 border-l border-slate-100 dark:border-slate-800 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.35)] transition-colors">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(resident)}
                              className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-[#0088f8] dark:hover:text-[#60b5ff] hover:bg-[#e8f4fd] dark:hover:bg-[#1e3554]"
                              title="Edit Warga"
                            >
                              <Pencil className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(resident.id)}
                              className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              title="Hapus Warga"
                            >
                              <Trash2 className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={currentUser?.role === 'admin' ? 14 : 13} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Icon3D icon={SearchX} size="lg" variant="slate" />
                        <p className="font-medium text-slate-700 dark:text-slate-300">
                          {searchTerm.trim()
                            ? `Tidak ada warga yang cocok dengan "${searchTerm.trim()}".`
                            : 'Tidak ada data warga ditemukan.'}
                        </p>
                        {searchTerm.trim() && (
                          <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            className="mt-1 px-4 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#233554] text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Reset Pencarian
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-slate-900/55 dark:bg-slate-950/80 sm:backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111c2e] dark:border dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/80 dark:bg-[#162339]">
              <div>
                <h3 className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  {isEditMode ? 'Edit Data Warga' : 'Tambah Data Warga'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isEditMode
                    ? 'Perbarui data unit, kontak, atau password akses warga.'
                    : 'Isi identitas unit dan akun login portal warga.'}
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                className="icon-btn-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
              {/* Scrollable Form Body */}
              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
                {formError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-medium leading-relaxed"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Nama Lengkap */}
                <div>
                  <label
                    htmlFor="resident-name"
                    className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Nama Lengkap <span className="text-rose-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="resident-name"
                    ref={setFieldRef('name')}
                    type="text"
                    placeholder="Contoh: Budi Santoso"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    onBlur={() => handleFieldBlur('name')}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'err-resident-name' : undefined}
                    className={`w-full px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 transition-colors text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 min-h-[44px] ${
                      fieldErrors.name
                        ? 'border-rose-400 dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/40 focus:bg-white dark:focus:bg-rose-950/60 focus:border-rose-500 focus:ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] focus:border-[#0088f8] focus:ring-[#0088f8]/20'
                    }`}
                  />
                  {fieldErrors.name && (
                    <p id="err-resident-name" role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 leading-snug">
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                {/* Jenis Properti & Blok */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div>
                    <label
                      htmlFor="resident-property"
                      className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 whitespace-nowrap"
                    >
                      Opsi Properti <span className="text-rose-500" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="resident-property"
                      ref={setFieldRef('propertyType')}
                      value={formData.propertyType}
                      onChange={(e) => handleFieldChange('propertyType', e.target.value)}
                      onBlur={() => handleFieldBlur('propertyType')}
                      aria-invalid={Boolean(fieldErrors.propertyType)}
                      aria-describedby={fieldErrors.propertyType ? 'err-resident-property' : undefined}
                      className={`w-full px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 transition-colors text-sm text-slate-900 dark:text-slate-100 min-h-[44px] cursor-pointer ${
                        fieldErrors.propertyType
                          ? 'border-rose-400 dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/40 focus:bg-white dark:focus:bg-rose-950/60 focus:border-rose-500 focus:ring-rose-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] focus:border-[#0088f8] focus:ring-[#0088f8]/20'
                      }`}
                    >
                      <option value="Perumahan">Perumahan</option>
                      <option value="Ruko">Ruko</option>
                    </select>
                    {fieldErrors.propertyType && (
                      <p id="err-resident-property" role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 leading-snug">
                        {fieldErrors.propertyType}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="resident-block"
                      className="flex items-center justify-between gap-1 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 whitespace-nowrap"
                    >
                      <span>Blok</span>
                      <span className="text-xs font-normal text-slate-400 dark:text-slate-500">(Opsional)</span>
                    </label>
                    <input
                      id="resident-block"
                      ref={setFieldRef('block')}
                      type="text"
                      placeholder="Contoh: A"
                      value={formData.block}
                      onChange={(e) => handleFieldChange('block', e.target.value)}
                      onBlur={() => handleFieldBlur('block')}
                      aria-invalid={Boolean(fieldErrors.block)}
                      aria-describedby={fieldErrors.block ? 'err-resident-block' : undefined}
                      className={`w-full px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 transition-colors text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 min-h-[44px] ${
                        fieldErrors.block
                          ? 'border-rose-400 dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/40 focus:bg-white dark:focus:bg-rose-950/60 focus:border-rose-500 focus:ring-rose-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] focus:border-[#0088f8] focus:ring-[#0088f8]/20'
                      }`}
                    />
                    {fieldErrors.block && (
                      <p id="err-resident-block" role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 leading-snug">
                        {fieldErrors.block}
                      </p>
                    )}
                  </div>
                </div>

                {/* Nomor Unit & Nominal Iuran */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div>
                    <label
                      htmlFor="resident-house"
                      className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 whitespace-nowrap"
                    >
                      Nomor Rumah / Ruko <span className="text-rose-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="resident-house"
                      ref={setFieldRef('houseNumber')}
                      type="text"
                      placeholder="Contoh: 01"
                      value={formData.houseNumber}
                      onChange={(e) => handleFieldChange('houseNumber', e.target.value)}
                      onBlur={() => handleFieldBlur('houseNumber')}
                      aria-invalid={Boolean(fieldErrors.houseNumber)}
                      aria-describedby={fieldErrors.houseNumber ? 'err-resident-house' : undefined}
                      className={`w-full px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 transition-colors text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 min-h-[44px] ${
                        fieldErrors.houseNumber
                          ? 'border-rose-400 dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/40 focus:bg-white dark:focus:bg-rose-950/60 focus:border-rose-500 focus:ring-rose-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] focus:border-[#0088f8] focus:ring-[#0088f8]/20'
                      }`}
                    />
                    {fieldErrors.houseNumber && (
                      <p id="err-resident-house" role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 leading-snug">
                        {fieldErrors.houseNumber}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="resident-dues"
                      className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 whitespace-nowrap"
                    >
                      Nominal Iuran / Bulan <span className="text-rose-500" aria-hidden="true">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 dark:text-slate-400 pointer-events-none">
                        Rp
                      </span>
                      <input
                        id="resident-dues"
                        ref={setFieldRef('monthlyDues')}
                        type="text"
                        inputMode="numeric"
                        placeholder="Masukkan nominal iuran"
                        value={formData.monthlyDues}
                        onChange={(e) => handleFieldChange('monthlyDues', e.target.value.replace(/[^\d]/g, ''))}
                        onBlur={() => handleFieldBlur('monthlyDues')}
                        aria-invalid={Boolean(fieldErrors.monthlyDues)}
                        aria-describedby={fieldErrors.monthlyDues ? 'err-resident-dues' : undefined}
                        className={`w-full pl-10 pr-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 transition-colors text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 tabular-nums min-h-[44px] ${
                          fieldErrors.monthlyDues
                            ? 'border-rose-400 dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/40 focus:bg-white dark:focus:bg-rose-950/60 focus:border-rose-500 focus:ring-rose-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] focus:border-[#0088f8] focus:ring-[#0088f8]/20'
                        }`}
                      />
                    </div>
                    {fieldErrors.monthlyDues && (
                      <p id="err-resident-dues" role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 leading-snug">
                        {fieldErrors.monthlyDues}
                      </p>
                    )}
                  </div>
                </div>

                {/* Nomor HP */}
                <div>
                  <label
                    htmlFor="resident-phone"
                    className="flex items-center justify-between gap-1 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    <span>Nomor HP</span>
                    <span className="text-xs font-normal text-slate-400 dark:text-slate-500">(Opsional)</span>
                  </label>
                  <input
                    id="resident-phone"
                    ref={setFieldRef('phone')}
                    type="tel"
                    inputMode="tel"
                    placeholder="Contoh: 081234567890"
                    value={formData.phone}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    onBlur={() => handleFieldBlur('phone')}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? 'err-resident-phone' : 'help-resident-phone'}
                    className={`w-full px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 transition-colors text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 tabular-nums min-h-[44px] ${
                      fieldErrors.phone
                        ? 'border-rose-400 dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/40 focus:bg-white dark:focus:bg-rose-950/60 focus:border-rose-500 focus:ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] focus:border-[#0088f8] focus:ring-[#0088f8]/20'
                    }`}
                  />
                  {fieldErrors.phone ? (
                    <p id="err-resident-phone" role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 leading-snug">
                      {fieldErrors.phone}
                    </p>
                  ) : (
                    <p id="help-resident-phone" className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      Disimpan sebagai kontak warga untuk keperluan komunikasi paguyuban.
                    </p>
                  )}
                </div>

                {/* Akun Akses Portal */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Akun Akses Portal</p>
                    {isEditMode && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Kosongkan password jika tetap</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    <div>
                      <label
                        htmlFor="resident-id-login"
                        className="flex items-center justify-between gap-1 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 whitespace-nowrap"
                      >
                        <span>
                          ID Pengguna {!isEditMode && <span className="text-rose-500" aria-hidden="true">*</span>}
                        </span>
                        {isEditMode && <span className="text-xs font-normal text-slate-400 dark:text-slate-500">(Tetap)</span>}
                      </label>
                      <input
                        id="resident-id-login"
                        ref={setFieldRef('idLogin')}
                        disabled={isEditMode}
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={isEditMode ? 'Akun sudah terdaftar' : 'Contoh: warga.a01'}
                        value={isEditMode ? 'Akun sudah terdaftar' : formData.idLogin}
                        onChange={(e) => handleFieldChange('idLogin', e.target.value)}
                        onBlur={() => handleFieldBlur('idLogin')}
                        aria-invalid={Boolean(fieldErrors.idLogin)}
                        aria-describedby={fieldErrors.idLogin ? 'err-resident-id' : undefined}
                        className={`w-full px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 transition-colors text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:opacity-60 disabled:bg-slate-100 dark:disabled:bg-[#142034] disabled:text-slate-500 dark:disabled:text-slate-400 min-h-[44px] ${
                          fieldErrors.idLogin
                            ? 'border-rose-400 dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/40 focus:bg-white dark:focus:bg-rose-950/60 focus:border-rose-500 focus:ring-rose-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] focus:border-[#0088f8] focus:ring-[#0088f8]/20'
                        }`}
                      />
                      {fieldErrors.idLogin && (
                        <p id="err-resident-id" role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 leading-snug">
                          {fieldErrors.idLogin}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="resident-password"
                        className="flex items-center justify-between gap-1 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 whitespace-nowrap"
                      >
                        <span>
                          Password {!isEditMode && <span className="text-rose-500" aria-hidden="true">*</span>}
                        </span>
                        {isEditMode && <span className="text-xs font-normal text-slate-400 dark:text-slate-500">(Opsional)</span>}
                      </label>
                      <input
                        id="resident-password"
                        ref={setFieldRef('password')}
                        type="text"
                        autoComplete="new-password"
                        placeholder={isEditMode ? 'Kosongkan jika tetap' : 'Minimal 4 karakter'}
                        value={formData.password}
                        onChange={(e) => handleFieldChange('password', e.target.value)}
                        onBlur={() => handleFieldBlur('password')}
                        aria-invalid={Boolean(fieldErrors.password)}
                        aria-describedby={fieldErrors.password ? 'err-resident-password' : undefined}
                        className={`w-full px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 transition-colors text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 min-h-[44px] ${
                          fieldErrors.password
                            ? 'border-rose-400 dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/40 focus:bg-white dark:focus:bg-rose-950/60 focus:border-rose-500 focus:ring-rose-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#18263d] focus:bg-white dark:focus:bg-[#1f304d] focus:border-[#0088f8] focus:ring-[#0088f8]/20'
                        }`}
                      />
                      {fieldErrors.password && (
                        <p id="err-resident-password" role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 leading-snug">
                          {fieldErrors.password}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Modal Footer */}
              <div className="px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-[#162339] space-y-3 shrink-0">
                {isSubmitting && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#e8f4fd] dark:bg-[#152843] border border-blue-200/80 dark:border-blue-500/30 text-[#0070e0] dark:text-[#60b5ff] text-xs font-semibold"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0088f8] dark:text-[#60b5ff] shrink-0" />
                    <span>
                      {isEditMode
                        ? 'Sedang menyimpan perubahan data warga ke Firestore...'
                        : 'Sedang menyimpan & menyinkronkan warga baru ke Firestore...'}
                    </span>
                  </div>
                )}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsModalOpen(false)}
                    className="w-full sm:w-auto sm:min-w-[110px] px-5 py-2.5 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-200/70 dark:hover:bg-[#233554] bg-white dark:bg-[#18263d] border border-slate-200 dark:border-slate-700 rounded-2xl transition-colors text-xs sm:text-sm cursor-pointer min-h-[44px] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto sm:min-w-[158px] inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0088f8] text-white font-bold rounded-2xl hover:bg-[#0070e0] transition-colors shadow-xs text-xs sm:text-sm cursor-pointer disabled:opacity-75 disabled:cursor-wait min-h-[44px] whitespace-nowrap"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    <span>
                      {isSubmitting
                        ? isEditMode
                          ? 'Menyimpan...'
                          : 'Menyinkronkan...'
                        : isEditMode
                        ? 'Simpan Perubahan'
                        : 'Simpan Warga'}
                    </span>
                  </button>
                </div>
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
            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-slate-100 mb-2">Hapus Warga?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Apakah Anda yakin ingin menghapus warga ini? Semua riwayat pembayaran terkait juga akan terhapus.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2.5 font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#233554] rounded-2xl transition-colors w-full sm:w-auto text-xs sm:text-sm cursor-pointer min-h-[44px] disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="px-5 py-2.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-2xl transition-colors w-full sm:w-auto shadow-xs text-xs sm:text-sm cursor-pointer min-h-[44px] disabled:opacity-60"
              >
                {isDeleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Enlarged Resident Profile Photo Preview Modal */}
      {previewResidentPhoto && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-slate-900/75 dark:bg-black/85 sm:backdrop-blur-xs"
          onClick={() => setPreviewResidentPhoto(null)}
        >
          <div
            className="bg-white dark:bg-[#111c2e] rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200/80 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#162339]">
              <div className="min-w-0">
                <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base truncate">
                  {previewResidentPhoto.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {previewResidentPhoto.unitLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewResidentPhoto(null)}
                className="icon-btn-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                aria-label="Tutup foto profil"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-100/60 dark:bg-[#0b1220]/70">
              <img
                src={previewResidentPhoto.url}
                alt={previewResidentPhoto.name}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                className="max-h-[60vh] w-full rounded-2xl object-contain"
              />
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
        subtitle="Daftar & status iuran warga · pilih cakupan data"
        filteredOption={{
          label: 'Sesuai Filter & Mode Aktif',
          description: activeFilterSummary,
          count: filteredEntries.length,
        }}
        allOption={{
          label: 'Semua Data Warga',
          description:
            viewMode === 'matrix'
              ? `Seluruh warga terdaftar dengan rekap 12 bulan tahun ${selectedYear}.`
              : `Seluruh warga terdaftar dengan status periode ${getMonthName(selectedMonth)} ${selectedYear}.`,
          count: residents.length,
        }}
        onExport={handleExportCsv}
      />
    </div>
  );
};
