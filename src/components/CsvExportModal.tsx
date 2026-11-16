import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  CreditCard,
  Download,
  FileSpreadsheet,
  Receipt,
  Users,
  X,
} from 'lucide-react';
import { Icon3D } from './Icon3D';
import { translateErrorToIndonesian } from '../utils';

export type CsvHubDataset = 'payments' | 'residents' | 'expenses';
export type CsvExportScope = 'filtered' | 'all';

interface ScopedOptionConfig {
  label: string;
  description: string;
  count: number;
}

interface HubDatasetConfig {
  id: CsvHubDataset;
  label: string;
  description: string;
  filteredLabel: string;
  filteredDescription: string;
  filteredCount: number;
  allLabel: string;
  allDescription: string;
  allCount: number;
}

interface ScopedCsvExportModalProps {
  mode: 'scoped';
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  filteredOption: ScopedOptionConfig;
  allOption: ScopedOptionConfig;
  onExport: (scope: CsvExportScope) => void;
}

interface HubCsvExportModalProps {
  mode: 'hub';
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  datasets: HubDatasetConfig[];
  onExport: (dataset: CsvHubDataset, scope: CsvExportScope) => void;
}

export type CsvExportModalProps = ScopedCsvExportModalProps | HubCsvExportModalProps;

const DATASET_ICONS: Record<CsvHubDataset, typeof CreditCard> = {
  payments: CreditCard,
  residents: Users,
  expenses: Receipt,
};

export const CsvExportModal: React.FC<CsvExportModalProps> = (props) => {
  const { isOpen, onClose, title, subtitle } = props;
  const shouldReduceMotion = useReducedMotion();

  const [selectedDataset, setSelectedDataset] = useState<CsvHubDataset>('payments');
  const [selectedScope, setSelectedScope] = useState<CsvExportScope>('filtered');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    if (props.mode === 'scoped') {
      setSelectedScope(
        props.filteredOption.count > 0
          ? 'filtered'
          : props.allOption.count > 0
          ? 'all'
          : 'filtered'
      );
    } else {
      const firstNonEmpty =
        props.datasets.find((d) => d.filteredCount > 0 || d.allCount > 0)?.id || 'payments';
      setSelectedDataset(firstNonEmpty);
      const ds = props.datasets.find((d) => d.id === firstNonEmpty);
      if (ds) {
        setSelectedScope(
          ds.filteredCount > 0 ? 'filtered' : ds.allCount > 0 ? 'all' : 'filtered'
        );
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || props.mode !== 'hub') return;
    const ds = props.datasets.find((d) => d.id === selectedDataset);
    if (!ds) return;
    if (selectedScope === 'filtered' && ds.filteredCount === 0 && ds.allCount > 0) {
      setSelectedScope('all');
    } else if (selectedScope === 'all' && ds.allCount === 0 && ds.filteredCount > 0) {
      setSelectedScope('filtered');
    }
  }, [selectedDataset, isOpen]);

  if (!isOpen) return null;

  const activeHubDataset =
    props.mode === 'hub'
      ? props.datasets.find((d) => d.id === selectedDataset) || props.datasets[0]
      : null;

  const filteredConfig: ScopedOptionConfig =
    props.mode === 'scoped'
      ? props.filteredOption
      : {
          label: activeHubDataset?.filteredLabel || 'Sesuai Periode Aktif',
          description: activeHubDataset?.filteredDescription || '',
          count: activeHubDataset?.filteredCount || 0,
        };

  const allConfig: ScopedOptionConfig =
    props.mode === 'scoped'
      ? props.allOption
      : {
          label: activeHubDataset?.allLabel || 'Semua Data',
          description: activeHubDataset?.allDescription || '',
          count: activeHubDataset?.allCount || 0,
        };

  const activeCount = selectedScope === 'filtered' ? filteredConfig.count : allConfig.count;

  const handleConfirmExport = () => {
    if (activeCount <= 0) return;
    setErrorMsg('');
    try {
      if (props.mode === 'scoped') {
        props.onExport(selectedScope);
      } else if (activeHubDataset) {
        props.onExport(activeHubDataset.id, selectedScope);
      }
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        translateErrorToIndonesian(err, 'Gagal mengekspor data ke CSV. Silakan coba lagi.')
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-slate-900/55 dark:bg-black/80 sm:backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-export-title"
    >
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0.08 : 0.18, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#111c2e] rounded-3xl w-full max-w-md shadow-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-[#162339]">
          <div className="flex items-center gap-3 min-w-0">
            <Icon3D icon={FileSpreadsheet} size="md" variant="blue" />
            <div className="min-w-0">
              <h3
                id="csv-export-title"
                className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/80"
            aria-label="Tutup dialog ekspor CSV"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {props.mode === 'hub' && (
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                1. Pilih Jenis Data
              </p>
              <div className="space-y-2">
                {props.datasets.map((ds) => {
                  const IconComp = DATASET_ICONS[ds.id];
                  const isSelected = selectedDataset === ds.id;
                  return (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => setSelectedDataset(ds.id)}
                      className={`w-full text-left px-4 py-3 rounded-2xl border transition-colors flex items-center justify-between gap-3 cursor-pointer min-h-[54px] ${
                        isSelected
                          ? 'bg-[#e8f4fd]/70 dark:bg-[#152a45] border-[#0088f8] dark:border-[#60b5ff]'
                          : 'bg-white dark:bg-[#162339]/60 border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#18263d]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-[#0088f8] text-white'
                              : 'bg-slate-100 dark:bg-[#1e2f4d] text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <IconComp className="w-4 h-4 stroke-[2]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {ds.label}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {ds.description} · <span className="tabular-nums font-semibold">{ds.allCount}</span> data
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-[#0088f8] border-[#0088f8] text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {props.mode === 'hub' ? '2. Pilih Cakupan Data' : 'Pilih Cakupan Data'}
            </p>
            <div className="space-y-2">
              {(
                [
                  { id: 'filtered' as CsvExportScope, config: filteredConfig },
                  { id: 'all' as CsvExportScope, config: allConfig },
                ] as const
              ).map(({ id, config }) => {
                const isSelected = selectedScope === id;
                const isEmpty = config.count === 0;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isEmpty}
                    onClick={() => setSelectedScope(id)}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl border transition-colors flex items-start justify-between gap-3 min-h-[56px] ${
                      isEmpty
                        ? 'bg-slate-50/70 dark:bg-[#0f1829] border-slate-200/60 dark:border-slate-800/60 opacity-55 cursor-not-allowed'
                        : isSelected
                        ? 'bg-[#e8f4fd]/70 dark:bg-[#152a45] border-[#0088f8] dark:border-[#60b5ff] cursor-pointer'
                        : 'bg-white dark:bg-[#162339]/60 border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#18263d] cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {config.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                          · {config.count} baris
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {config.description}
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 mt-0.5 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected && !isEmpty
                          ? 'bg-[#0088f8] border-[#0088f8] text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isSelected && !isEmpty && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredConfig.count === 0 && allConfig.count > 0 && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200/80 dark:border-amber-700/40 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              Filter aktif tidak memiliki baris untuk diekspor. Anda tetap dapat mengunduh opsi semua data.
            </div>
          )}

          {filteredConfig.count === 0 && allConfig.count === 0 && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#162339] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Belum ada data yang tersimpan untuk kategori ini.
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Format CSV standar (pemisah koma, UTF-8) siap dibuka di Microsoft Excel maupun Google Sheets.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0 bg-slate-50/40 dark:bg-[#162339]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#1f304d] transition-colors cursor-pointer min-h-[44px] whitespace-nowrap shrink-0"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={activeCount <= 0}
            onClick={handleConfirmExport}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-white bg-[#0088f8] hover:bg-[#0070e0] transition-colors shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px] whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 stroke-[2]" />
            <span>Unduh CSV ({activeCount})</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
