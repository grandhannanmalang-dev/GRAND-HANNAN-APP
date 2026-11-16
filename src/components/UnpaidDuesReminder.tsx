import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, BellRing, Users, X } from 'lucide-react';
import { formatIDR } from '../utils';
import { Icon3D } from './Icon3D';

interface UnpaidDuesReminderProps {
  role: 'admin' | 'resident';
  monthName: string;
  year: number;
  residentStatus?: 'unpaid' | 'tertunda';
  residentAmount?: number;
  residentUnitLabel?: string;
  unpaidCount?: number;
  unpaidTotalAmount?: number;
  tertundaCount?: number;
  onAction: () => void;
  onDismiss: () => void;
}

export const UnpaidDuesReminder: React.FC<UnpaidDuesReminderProps> = ({
  role,
  monthName,
  year,
  residentStatus = 'unpaid',
  residentAmount = 150000,
  residentUnitLabel,
  unpaidCount = 0,
  unpaidTotalAmount = 0,
  tertundaCount = 0,
  onAction,
  onDismiss,
}) => {
  const isResident = role === 'resident';

  return (
    <motion.section
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
      className="bg-amber-50/95 dark:bg-amber-950/35 border border-amber-200/90 dark:border-amber-700/45 rounded-3xl p-4 sm:p-5 shadow-xs transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <Icon3D icon={BellRing} size="lg" variant="amber" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 truncate">
                {isResident
                  ? `Pengingat Iuran · ${monthName} ${year}${residentUnitLabel ? ` · ${residentUnitLabel}` : ''}`
                  : `Pengingat Otomatis · ${monthName} ${year}`}
              </p>

              {/* Mobile dismiss button aligned to top-right */}
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Tutup pengingat sementara"
                title="Tutup sementara untuk sesi ini"
                className="sm:hidden icon-btn-md -mr-1 -mt-1 text-amber-800/75 dark:text-amber-200/75 hover:text-amber-950 dark:hover:text-amber-100 hover:bg-amber-200/50 dark:hover:bg-amber-900/50"
              >
                <X className="w-4 h-4 stroke-[2]" />
              </button>
            </div>

            <h2 className="font-display font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base mt-0.5">
              {isResident
                ? residentStatus === 'tertunda'
                  ? 'Iuran Bulan Ini Berstatus Tertunda'
                  : 'Anda Belum Membayar Iuran Bulan Ini'
                : `${unpaidCount} Warga Belum Melunasi Iuran Bulan Ini`}
            </h2>

            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
              {isResident ? (
                <>
                  Tagihan iuran sebesar{' '}
                  <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatIDR(residentAmount)}
                  </span>{' '}
                  untuk periode {monthName} {year} belum dibayarkan. Segera lakukan transfer dan unggah bukti pembayaran.
                </>
              ) : (
                <>
                  Total tagihan yang belum masuk sebesar{' '}
                  <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatIDR(unpaidTotalAmount)}
                  </span>
                  {tertundaCount > 0 ? (
                    <span className="tabular-nums"> (termasuk {tertundaCount} warga berstatus tertunda)</span>
                  ) : null}
                  . Tinjau daftar warga untuk memantau kelancaran kas bulan berjalan.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAction}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap shadow-sm shadow-blue-500/20"
          >
            {isResident ? (
              <>
                <span>Bayar Sekarang</span>
                <ArrowUpRight className="w-4 h-4 icon-3d-glyph" />
              </>
            ) : (
              <>
                <Users className="w-4 h-4 icon-3d-glyph" />
                <span>Lihat Daftar</span>
              </>
            )}
          </button>

          {/* Desktop dismiss button */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Tutup pengingat sementara"
            title="Tutup sementara untuk sesi ini"
            className="hidden sm:inline-flex icon-btn-md text-amber-800/75 dark:text-amber-200/75 hover:text-amber-950 dark:hover:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-amber-900/50"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      </div>
    </motion.section>
  );
};
