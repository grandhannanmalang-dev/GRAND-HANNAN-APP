import { Expense, Payment, Resident } from '../types';
import {
  getMonthName,
  getResidentPaymentSummary,
  normalizePaymentStatus,
  ResidentMonthStatus,
  resolveResidentPaymentForMonth,
  safeTimeMs,
} from '../utils';

const SHORT_MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

const FORMULA_INJECTION_REGEX = /^[=+\-@\t\r]/;

export const sanitizeFilenamePart = (value: string): string => {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'data';
};

export const escapeCsvCell = (
  value: string | number | boolean | null | undefined
): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'Ya' : 'Tidak';
  }

  let str = String(value);
  if (FORMULA_INJECTION_REGEX.test(str)) {
    str = `'${str}`;
  }

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const generateCsvContent = (
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string => {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;
};

export const downloadCsvFile = (filename: string, csvContent: string): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Ekspor CSV hanya dapat dilakukan melalui browser.');
  }

  let objectUrl: string | null = null;
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    throw new Error('Browser gagal memicu unduhan file CSV. Silakan coba lagi.');
  } finally {
    if (objectUrl) {
      const urlToRevoke = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1500);
    }
  }
};

export const formatCsvIsoDate = (dateInput?: string | null): string => {
  const ms = safeTimeMs(dateInput);
  if (!ms) return '-';
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCsvPaymentStatusLabel = (
  status?: Payment['status'] | 'unpaid'
): string => {
  switch (status) {
    case 'verified':
      return 'Lunas';
    case 'pending':
      return 'Menunggu Verifikasi';
    case 'tertunda':
      return 'Tertunda';
    case 'unpaid':
    default:
      return 'Belum Bayar';
  }
};

export const buildPaymentsCsv = (
  payments: Payment[],
  residents: Resident[]
): string => {
  const residentMap = new Map<string, Resident>();
  for (const r of residents) {
    residentMap.set(r.id, r);
  }

  const sorted = [...payments].sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));

  const headers = [
    'ID Pembayaran',
    'Nama Warga',
    'Jenis Properti',
    'Blok',
    'Nomor Rumah',
    'No. WhatsApp',
    'Periode Bulan',
    'Periode Tahun',
    'Tanggal Pembayaran',
    'Nominal (IDR)',
    'Status',
    'Bukti Transfer',
  ];

  const rows = sorted.map((payment) => {
    const resident = residentMap.get(payment.residentId);
    const status = normalizePaymentStatus(payment);
    const monthLabel = getMonthName(Number(payment.month)) || String(payment.month);

    return [
      payment.id,
      resident?.name || 'Warga Terhapus',
      resident?.propertyType || '-',
      resident?.block || '-',
      resident?.houseNumber || '-',
      resident?.phone || '-',
      monthLabel,
      Number(payment.year) || 0,
      formatCsvIsoDate(payment.date),
      Number(payment.amount) || 0,
      getCsvPaymentStatusLabel(status),
      payment.proofOfPayment ? 'Ada' : 'Tidak Ada',
    ];
  });

  return generateCsvContent(headers, rows);
};

export const buildResidentsListCsv = (
  entries: ResidentMonthStatus[],
  month: number,
  year: number
): string => {
  const periodLabel = `${getMonthName(month)} ${year}`;
  const headers = [
    'ID Warga',
    'Nama Lengkap',
    'Jenis Properti',
    'Blok',
    'Nomor Rumah',
    'No. WhatsApp',
    'Tanggal Bergabung',
    'Nominal Iuran Bulanan (IDR)',
    `Status Iuran (${periodLabel})`,
    'Tanggal Bayar Periode',
  ];

  const rows = entries.map(({ resident, payment, status }) => [
    resident.id,
    resident.name,
    resident.propertyType || 'Perumahan',
    resident.block || '-',
    resident.houseNumber,
    resident.phone || '-',
    formatCsvIsoDate(resident.joinDate),
    Number(resident.monthlyDues) || 150000,
    getCsvPaymentStatusLabel(status),
    payment ? formatCsvIsoDate(payment.date) : '-',
  ]);

  return generateCsvContent(headers, rows);
};

export const buildResidentsMatrixCsv = (
  residents: Resident[],
  payments: Payment[],
  year: number
): string => {
  const monthHeaders = SHORT_MONTHS_ID.map((m) => `${m} ${year}`);
  const headers = [
    'ID Warga',
    'Nama Lengkap',
    'Jenis Properti',
    'Blok',
    'Nomor Rumah',
    'No. WhatsApp',
    'Iuran Bulanan (IDR)',
    ...monthHeaders,
    'Total Lunas (Bulan)',
  ];

  const rows = residents.map((resident) => {
    let paidMonths = 0;
    const monthStatuses = Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const p = resolveResidentPaymentForMonth(payments, resident.id, m, year);
      const status = p ? normalizePaymentStatus(p) : 'unpaid';
      if (status === 'verified') {
        paidMonths += 1;
      }
      return getCsvPaymentStatusLabel(status);
    });

    return [
      resident.id,
      resident.name,
      resident.propertyType || 'Perumahan',
      resident.block || '-',
      resident.houseNumber,
      resident.phone || '-',
      Number(resident.monthlyDues) || 150000,
      ...monthStatuses,
      paidMonths,
    ];
  });

  return generateCsvContent(headers, rows);
};

export const buildAllResidentsListCsv = (
  residents: Resident[],
  payments: Payment[],
  month: number,
  year: number
): string => {
  const summary = getResidentPaymentSummary(residents, payments, month, year);
  return buildResidentsListCsv(summary.entries, month, year);
};

export const buildExpensesCsv = (expenses: Expense[]): string => {
  const sorted = [...expenses].sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));
  const headers = [
    'ID Pengeluaran',
    'Tanggal',
    'Bulan',
    'Tahun',
    'Keterangan',
    'Nominal Pengeluaran (IDR)',
    'Bukti Pengeluaran',
  ];

  const rows = sorted.map((expense) => {
    const parsed = new Date(expense.date);
    const derivedMonth = Number(expense.month) || (Number.isFinite(parsed.getTime()) ? parsed.getMonth() + 1 : 0);
    const derivedYear = Number(expense.year) || (Number.isFinite(parsed.getTime()) ? parsed.getFullYear() : 0);

    return [
      expense.id,
      formatCsvIsoDate(expense.date),
      derivedMonth ? getMonthName(derivedMonth) : '-',
      derivedYear || '-',
      expense.description,
      Number(expense.amount) || 0,
      expense.proofPhoto ? 'Ada' : 'Tidak Ada',
    ];
  });

  return generateCsvContent(headers, rows);
};
