import React, { memo, useCallback, useMemo, useState } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'motion/react';
import { BarChart3, Calendar } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { Payment, Resident } from '../types';
import { formatIDR, getMonthName, normalizePaymentStatus } from '../utils';
import { Icon3D } from './Icon3D';

interface MonthlyDuesChartProps {
  payments: Payment[];
  residents: Resident[];
  isDark: boolean;
  selectedYear: number;
  availableYears: number[];
  onYearChange: (year: number) => void;
}

type ViewRange = 'year' | 'last6';

interface MonthlyDuesPoint {
  key: string;
  shortLabel: string;
  fullLabel: string;
  totalMasuk: number;
  target: number;
  paidCount: number;
  totalResidents: number;
  achievementPct: number;
  isCurrentMonth: boolean;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: MonthlyDuesPoint;
  }>;
  isDark: boolean;
}

const formatCompactRupiah = (value: number): string => {
  if (value <= 0) return 'Rp0';
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = Number.isInteger(millions)
      ? millions.toString()
      : millions.toFixed(1).replace('.', ',');
    return `Rp${formatted}jt`;
  }
  if (value >= 1_000) {
    return `Rp${Math.round(value / 1_000)}rb`;
  }
  return `Rp${value}`;
};

const CustomChartTooltip: React.FC<ChartTooltipProps> = memo(({ active, payload, isDark }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      className={`rounded-2xl px-4 py-3 border shadow-lg text-xs min-w-[210px] ${
        isDark
          ? 'bg-[#0f172a] border-slate-700/80 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      <p className="font-display font-bold text-sm mb-2">{point.fullLabel}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#0088f8] dark:bg-[#38bdf8] inline-block" />
            Iuran Masuk
          </span>
          <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {formatIDR(point.totalMasuk)}
          </span>
        </div>
        {point.target > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600 inline-block" />
              Target Bulanan
            </span>
            <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
              {formatIDR(point.target)}
            </span>
          </div>
        )}
        <div className="pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Warga Lunas</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {point.paidCount}/{point.totalResidents} ({point.achievementPct}%)
          </span>
        </div>
      </div>
    </div>
  );
});
CustomChartTooltip.displayName = 'CustomChartTooltip';

export const MonthlyDuesChart: React.FC<MonthlyDuesChartProps> = memo(({
  payments,
  residents,
  isDark,
  selectedYear,
  availableYears,
  onYearChange,
}) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [viewRange, setViewRange] = useState<ViewRange>('year');
  const [showTarget, setShowTarget] = useState<boolean>(true);
  const shouldReduceMotion = useReducedMotion();

  const activeYear = availableYears.includes(selectedYear) ? selectedYear : currentYear;

  const expectedMonthlyTarget = useMemo(
    () => residents.reduce((sum, r) => sum + (r.monthlyDues || 150000), 0),
    [residents]
  );

  const groupedByMonthYear = useMemo(() => {
    const map = new Map<string, { totalMasuk: number; paidResidents: Set<string> }>();
    for (const p of payments) {
      if (normalizePaymentStatus(p) !== 'verified') continue;
      const key = `${Number(p.year)}-${Number(p.month)}`;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { totalMasuk: 0, paidResidents: new Set<string>() };
        map.set(key, bucket);
      }
      bucket.totalMasuk += Number(p.amount || 0);
      bucket.paidResidents.add(p.residentId);
    }
    return map;
  }, [payments]);

  const chartData: MonthlyDuesPoint[] = useMemo(() => {
    const buildPoint = (month: number, year: number, includeYearInShort: boolean): MonthlyDuesPoint => {
      const bucket = groupedByMonthYear.get(`${year}-${month}`);
      const totalMasuk = bucket ? bucket.totalMasuk : 0;
      const paidCount = bucket ? bucket.paidResidents.size : 0;
      const achievementPct =
        expectedMonthlyTarget > 0
          ? Math.round((totalMasuk / expectedMonthlyTarget) * 100)
          : 0;
      const monthName = getMonthName(month);

      return {
        key: `${year}-${month}`,
        shortLabel: includeYearInShort
          ? `${monthName.substring(0, 3)} ${String(year).slice(-2)}`
          : monthName.substring(0, 3),
        fullLabel: `${monthName} ${year}`,
        totalMasuk,
        target: expectedMonthlyTarget,
        paidCount,
        totalResidents: residents.length,
        achievementPct,
        isCurrentMonth: month === currentMonth && year === currentYear,
      };
    };

    if (viewRange === 'last6') {
      const points: MonthlyDuesPoint[] = [];
      for (let i = 5; i >= 0; i--) {
        let m = currentMonth - i;
        let y = currentYear;
        if (m <= 0) {
          m += 12;
          y -= 1;
        }
        points.push(buildPoint(m, y, true));
      }
      return points;
    }

    return Array.from({ length: 12 }, (_, idx) => buildPoint(idx + 1, activeYear, false));
  }, [
    groupedByMonthYear,
    expectedMonthlyTarget,
    residents.length,
    viewRange,
    activeYear,
    currentMonth,
    currentYear,
  ]);

  const summary = useMemo(() => {
    const totalPeriod = chartData.reduce((sum, item) => sum + item.totalMasuk, 0);
    const monthsWithIncome = chartData.filter((item) => item.totalMasuk > 0);
    const divisor = viewRange === 'last6' ? chartData.length : Math.max(monthsWithIncome.length, 1);
    const averageMonthly = totalPeriod > 0 ? Math.round(totalPeriod / divisor) : 0;

    let highestMonth: MonthlyDuesPoint | null = null;
    for (const item of chartData) {
      if (item.totalMasuk > 0 && (!highestMonth || item.totalMasuk > highestMonth.totalMasuk)) {
        highestMonth = item;
      }
    }

    return {
      totalPeriod,
      averageMonthly,
      highestMonth,
    };
  }, [chartData, viewRange]);

  const primaryBarColor = isDark ? '#38bdf8' : '#0088f8';
  const currentMonthBarColor = isDark ? '#60a5fa' : '#0070e0';
  const targetBarColor = isDark ? '#334155' : '#cbd5e1';

  const renderTooltipContent = useCallback(
    (props: { active?: boolean; payload?: readonly unknown[] }) => (
      <CustomChartTooltip
        active={props.active}
        payload={props.payload as ChartTooltipProps['payload']}
        isDark={isDark}
      />
    ),
    [isDark]
  );

  return (
    <section
      aria-label="Grafik Iuran Masuk Bulanan"
      className="bg-white dark:bg-[#111c2e] p-5 sm:p-6 border border-slate-200/70 dark:border-slate-800/90 rounded-3xl shadow-xs transition-colors"
    >
      {/* Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <Icon3D icon={BarChart3} size="md" variant="softBlue" />
          <div>
            <h2 className="text-base sm:text-lg font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Grafik Iuran Masuk Bulanan
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {viewRange === 'year'
                ? `Total iuran terverifikasi setiap bulan di tahun ${activeYear}`
                : 'Perbandingan pemasukan iuran 6 bulan terakhir'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Range Switcher */}
          <LayoutGroup id="chart-range-tabs">
            <div className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-[#162339] border border-slate-200/60 dark:border-slate-800 gap-1">
              <button
                type="button"
                onClick={() => setViewRange('year')}
                className={`relative isolate px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  viewRange === 'year'
                    ? 'text-[#0088f8] dark:text-[#38bdf8]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {viewRange === 'year' && (
                  <motion.span
                    layoutId="chart-range-pill"
                    transition={shouldReduceMotion ? { duration: 0.08 } : { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 }}
                    className="absolute inset-0 rounded-xl bg-white dark:bg-[#1e2f4a] shadow-xs -z-10"
                  />
                )}
                <span className="relative z-10">12 Bulan</span>
              </button>
              <button
                type="button"
                onClick={() => setViewRange('last6')}
                className={`relative isolate px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  viewRange === 'last6'
                    ? 'text-[#0088f8] dark:text-[#38bdf8]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {viewRange === 'last6' && (
                  <motion.span
                    layoutId="chart-range-pill"
                    transition={shouldReduceMotion ? { duration: 0.08 } : { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 }}
                    className="absolute inset-0 rounded-xl bg-white dark:bg-[#1e2f4a] shadow-xs -z-10"
                  />
                )}
                <span className="relative z-10">6 Bulan Terakhir</span>
              </button>
            </div>
          </LayoutGroup>

          {/* Year Filter Dropdown */}
          <div className="relative flex items-center">
            <Calendar className="w-3.5 h-3.5 text-[#0088f8] dark:text-[#38bdf8] absolute left-3.5 pointer-events-none" />
            <select
              aria-label="Filter Tahun Grafik Iuran"
              value={activeYear}
              onChange={(e) => {
                const nextYear = Number(e.target.value);
                onYearChange(nextYear);
                if (viewRange !== 'year') {
                  setViewRange('year');
                }
              }}
              className="pl-9 pr-7 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#162339] border border-slate-200/70 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:border-[#0088f8]/40 dark:hover:border-[#38bdf8]/40 focus:outline-none focus:ring-2 focus:ring-[#0088f8]/25 cursor-pointer tabular-nums transition-colors"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Tahun {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Target Bar Toggle */}
          <button
            type="button"
            onClick={() => setShowTarget((prev) => !prev)}
            aria-pressed={showTarget}
            className={`btn-secondary-action border ${
              showTarget
                ? 'bg-blue-50/80 dark:bg-sky-950/40 border-blue-200/80 dark:border-sky-800/70 text-[#0070e0] dark:text-[#38bdf8]'
                : 'bg-slate-100 dark:bg-[#162339] border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {showTarget ? 'Target: Tampil' : 'Target: Sembunyi'}
          </button>
        </div>
      </div>

      {/* Quick Monthly Summary Strip */}
      <div className="mb-5">
        <motion.div
          key={`${viewRange}-${activeYear}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: shouldReduceMotion ? 0.08 : 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <div className="rounded-2xl bg-slate-50/90 dark:bg-[#162339] border border-slate-200/60 dark:border-slate-800/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {viewRange === 'year' ? `Total Masuk ${activeYear}` : 'Total 6 Bulan'}
            </p>
            <p className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {formatIDR(summary.totalPeriod)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50/90 dark:bg-[#162339] border border-slate-200/60 dark:border-slate-800/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Rata-rata per Bulan
            </p>
            <p className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {formatIDR(summary.averageMonthly)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50/90 dark:bg-[#162339] border border-slate-200/60 dark:border-slate-800/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pemasukan Tertinggi
            </p>
            <p className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums truncate">
              {summary.highestMonth
                ? `${summary.highestMonth.shortLabel} · ${formatIDR(summary.highestMonth.totalMasuk)}`
                : 'Belum ada data'}
            </p>
          </div>
        </motion.div>
      </div>

      <motion.div
        key={`chart-${viewRange}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0.08 : 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
      {/* Empty Data Notice */}
      {summary.totalPeriod === 0 && (
        <div className="mb-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-[#162339]/60 px-4 py-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400 text-center">
          Belum ada iuran terverifikasi pada periode{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {viewRange === 'year' ? `tahun ${activeYear}` : '6 bulan terakhir'}
          </span>
          . Grafik batang akan terisi otomatis setelah pembayaran warga diverifikasi.
        </div>
      )}

      {/* Recharts BarChart */}
      <div className="h-72 sm:h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
            barGap={6}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={isDark ? '#1e293b' : '#e2e8f0'}
            />
            <XAxis
              dataKey="shortLabel"
              axisLine={false}
              tickLine={false}
              tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 12 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={64}
              tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
              tickFormatter={formatCompactRupiah}
            />
            <Tooltip
              cursor={{ fill: isDark ? '#18263d' : '#f1f5f9', radius: 8 }}
              content={renderTooltipContent}
            />
            <Legend
              wrapperStyle={{
                paddingTop: '14px',
                fontSize: '12px',
                color: isDark ? '#cbd5e1' : '#334155',
              }}
            />
            <Bar
              dataKey="totalMasuk"
              name="Iuran Masuk"
              radius={[8, 8, 0, 0]}
              maxBarSize={36}
              animationDuration={shouldReduceMotion ? 0 : 280}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={entry.isCurrentMonth ? currentMonthBarColor : primaryBarColor}
                />
              ))}
            </Bar>
            {showTarget && (
              <Bar
                dataKey="target"
                name="Target Bulanan"
                fill={targetBarColor}
                radius={[8, 8, 0, 0]}
                maxBarSize={36}
                animationDuration={shouldReduceMotion ? 0 : 280}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      </motion.div>
    </section>
  );
});
MonthlyDuesChart.displayName = 'MonthlyDuesChart';
