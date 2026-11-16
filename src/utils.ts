import { Resident, Payment, BankAccount, AppNotification, AppView, UserRole, AppUser } from './types';

export const formatIDR = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const getMonthName = (month: number) => {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return months[month - 1] || '';
};

export const generateId = () => {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
};

export const safeTimeMs = (dateInput?: string | number | Date | null): number => {
  if (!dateInput) return 0;
  const ms = dateInput instanceof Date ? dateInput.getTime() : new Date(dateInput).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export const safeFormatDate = (
  dateInput?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string => {
  const ms = safeTimeMs(dateInput);
  if (!ms) return '-';
  try {
    return new Date(ms).toLocaleDateString('id-ID', options);
  } catch {
    return '-';
  }
};

/**
 * Compresses an image file (e.g. up to 3MB or larger) into an optimized
 * base64 JPEG string with a maximum dimension of 1200px and balanced quality.
 * This ensures that proof receipts are legible while keeping document payload size
 * well within Firestore's 1MB limit (~70KB - 130KB).
 */
export const compressImage = (
  file: File,
  maxDimension = 1200,
  quality = 0.75
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File yang dipilih harus berupa gambar (JPG, PNG, JPEG, dsb).'));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale proportionally if either dimension exceeds maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG
        let compressed = canvas.toDataURL('image/jpeg', quality);

        // If for any edge case base64 length is still > 650KB (~870,000 characters),
        // re-encode with lower quality to strictly guarantee safety under 1MB
        if (compressed.length > 650000) {
          compressed = canvas.toDataURL('image/jpeg', 0.55);
        }

        resolve(compressed);
      };

      img.onerror = () => reject(new Error('Gagal memproses file gambar. Format file mungkin tidak didukung.'));
    };

    reader.onerror = () => reject(new Error('Gagal membaca file dari perangkat.'));
  });
};

/**
 * Recursively removes keys with undefined values to prevent Firestore unsupported field errors.
 */
export const cleanFirestoreData = <T extends Record<string, any>>(obj: T): T => {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        result[key] = cleanFirestoreData(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result as T;
};

export const getInitials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'WG';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export type EffectivePaymentStatus = 'verified' | 'pending' | 'tertunda' | 'unpaid';

export const normalizePaymentStatus = (payment?: Payment | null): 'verified' | 'pending' | 'tertunda' => {
  if (!payment?.status || payment.status === 'verified') return 'verified';
  if (payment.status === 'pending') return 'pending';
  return 'tertunda';
};

/**
 * Resolves the authoritative payment record for a resident in a specific month/year.
 * Priority: verified > pending > tertunda.
 */
export const resolveResidentPaymentForMonth = (
  payments: Payment[],
  residentId: string,
  month: number,
  year: number
): Payment | undefined => {
  const matches = payments.filter(
    p => p.residentId === residentId && Number(p.month) === Number(month) && Number(p.year) === Number(year)
  );
  if (matches.length === 0) return undefined;
  const verified = matches.find(p => normalizePaymentStatus(p) === 'verified');
  if (verified) return verified;
  const pending = matches.find(p => normalizePaymentStatus(p) === 'pending');
  if (pending) return pending;
  return matches[0];
};

export interface ResidentMonthStatus {
  resident: Resident;
  payment?: Payment;
  status: EffectivePaymentStatus;
}

export const getResidentPaymentSummary = (
  residents: Resident[],
  payments: Payment[],
  month: number,
  year: number
) => {
  const entries: ResidentMonthStatus[] = residents.map((resident) => {
    const payment = resolveResidentPaymentForMonth(payments, resident.id, month, year);
    const status: EffectivePaymentStatus = payment ? normalizePaymentStatus(payment) : 'unpaid';
    return { resident, payment, status };
  });

  return {
    entries,
    paid: entries.filter(e => e.status === 'verified'),
    pending: entries.filter(e => e.status === 'pending'),
    tertunda: entries.filter(e => e.status === 'tertunda'),
    unpaidOnly: entries.filter(e => e.status === 'unpaid'),
    notPaidYet: entries.filter(e => e.status === 'unpaid' || e.status === 'tertunda'),
  };
};

/**
 * Translates Firebase / network / runtime errors into clear Indonesian messages.
 */
export const translateErrorToIndonesian = (
  error: unknown,
  fallback = 'Terjadi kesalahan pada sistem. Silakan coba lagi.'
): string => {
  let raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : '';

  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) {
        raw = parsed.error;
      }
    } catch {
      // Keep original raw message if not valid JSON
    }
  }

  const lower = raw.toLowerCase();

  if (!raw) return fallback;

  if (lower.includes('unsupported field value') || lower.includes('invalid data')) {
    return 'Format data tidak valid atau terdapat kolom kosong yang tidak didukung. Silakan periksa kembali isian Anda.';
  }
  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return 'Akses ke database ditolak karena izin tidak mencukupi. Pastikan Anda login dengan akun yang sesuai.';
  }
  if (
    lower.includes('client is offline') ||
    lower.includes('unavailable') ||
    lower.includes('network') ||
    lower.includes('failed to fetch')
  ) {
    return 'Koneksi internet terputus atau server database tidak dapat dijangkau. Periksa jaringan Anda lalu coba lagi.';
  }
  if (lower.includes('quota exceeded') || lower.includes('resource-exhausted')) {
    return 'Batas kuota harian database telah tercapai. Silakan coba kembali besok.';
  }
  if (lower.includes('deadline-exceeded') || lower.includes('timeout')) {
    return 'Koneksi ke server melebihi batas waktu. Silakan coba lagi.';
  }
  if (lower.includes('not-found') || lower.includes('no document to update')) {
    return 'Data yang dituju tidak ditemukan di database.';
  }
  if (lower.includes('already-exists')) {
    return 'Data yang sama sudah terdaftar di sistem.';
  }
  if (lower.includes('invalid-argument')) {
    return 'Isian data tidak sesuai format. Periksa kembali formulir Anda.';
  }

  // Already a clear Indonesian sentence
  if (
    /(sudah|belum|tidak|gagal|hanya|wajib|minimal|maksimal|silakan|format|ukuran|sesi|data|nomor|nama|password|rekening|foto)/i.test(
      raw
    )
  ) {
    return raw;
  }

  return `${fallback} (${raw})`;
};

export type ResidentFormField =
  | 'name'
  | 'propertyType'
  | 'block'
  | 'houseNumber'
  | 'phone'
  | 'monthlyDues'
  | 'idLogin'
  | 'password';

export interface ResidentFormValues {
  name: string;
  propertyType: 'Perumahan' | 'Ruko';
  block: string;
  houseNumber: string;
  phone: string;
  monthlyDues: string;
  idLogin: string;
  password: string;
}

export type ResidentFormErrors = Partial<Record<ResidentFormField, string>>;

export const validateResidentField = (
  field: ResidentFormField,
  values: ResidentFormValues,
  options: {
    isEditMode: boolean;
    editingId?: string | null;
    existingResidents?: Resident[];
  }
): string | undefined => {
  const { isEditMode, editingId, existingResidents = [] } = options;

  switch (field) {
    case 'name': {
      const val = values.name.trim();
      if (!val) return 'Nama lengkap wajib diisi.';
      if (val.length < 2) return 'Nama lengkap minimal 2 karakter.';
      if (val.length > 80) return 'Nama lengkap maksimal 80 karakter.';
      return undefined;
    }

    case 'propertyType': {
      if (values.propertyType !== 'Perumahan' && values.propertyType !== 'Ruko') {
        return 'Pilih jenis properti yang valid.';
      }
      return undefined;
    }

    case 'block': {
      const val = values.block.trim();
      if (!val) return undefined;
      if (val.length > 10) return 'Blok maksimal 10 karakter.';
      if (!/^[a-zA-Z0-9\-\s]+$/.test(val)) {
        return 'Blok hanya boleh berisi huruf, angka, atau tanda hubung.';
      }
      return undefined;
    }

    case 'houseNumber': {
      const val = values.houseNumber.trim();
      if (!val) return 'Nomor rumah/ruko wajib diisi.';
      if (val.length > 20) return 'Nomor rumah/ruko maksimal 20 karakter.';
      if (!/^[a-zA-Z0-9\-\/.\s]+$/.test(val)) {
        return 'Nomor rumah hanya boleh berisi huruf, angka, garis miring, atau tanda hubung.';
      }
      const normalizedBlock = values.block.trim().toLowerCase();
      const normalizedHouse = val.toLowerCase();
      const duplicate = existingResidents.find(
        (r) =>
          r.id !== editingId &&
          r.propertyType === values.propertyType &&
          (r.block || '').trim().toLowerCase() === normalizedBlock &&
          r.houseNumber.trim().toLowerCase() === normalizedHouse
      );
      if (duplicate) {
        const blockLabel = values.block.trim() ? ` Blok ${values.block.trim()}` : '';
        return `${values.propertyType}${blockLabel} No. ${val} sudah terdaftar (${duplicate.name}).`;
      }
      return undefined;
    }

    case 'phone': {
      const val = values.phone.trim();
      if (!val) return undefined;
      if (!/^[0-9+\-\s()]+$/.test(val)) {
        return 'Nomor HP hanya boleh berisi angka dan simbol +, -, spasi.';
      }
      const digits = val.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) {
        return 'Nomor HP harus terdiri dari 9 hingga 15 digit.';
      }
      if (!/^(08|628|8|0[2-9]|62[2-9])/.test(digits)) {
        return 'Gunakan nomor telepon Indonesia yang valid (misal 08... atau 628...).';
      }
      return undefined;
    }

    case 'monthlyDues': {
      const raw = values.monthlyDues.trim();
      if (!raw) return 'Nominal iuran bulanan wajib diisi.';
      if (!/^\d+$/.test(raw)) {
        return 'Nominal iuran hanya boleh berisi angka tanpa titik atau huruf.';
      }
      const amount = Number(raw);
      if (amount < 1000) return 'Nominal iuran minimal Rp 1.000.';
      if (amount > 100000000) return 'Nominal iuran maksimal Rp 100.000.000.';
      return undefined;
    }

    case 'idLogin': {
      if (isEditMode) return undefined;
      const val = values.idLogin.trim();
      if (!val) return 'ID Pengguna wajib diisi untuk akses login warga.';
      if (/\s/.test(values.idLogin)) return 'ID Pengguna tidak boleh mengandung spasi.';
      if (val.length < 3) return 'ID Pengguna minimal 3 karakter.';
      if (val.length > 40) return 'ID Pengguna maksimal 40 karakter.';
      if (!/^[a-zA-Z0-9._@-]+$/.test(val)) {
        return 'Gunakan huruf, angka, titik (.), garis bawah (_), atau strip (-).';
      }
      if (val.toLowerCase() === 'admin') {
        return 'ID Pengguna "admin" dicadangkan khusus untuk pengelola.';
      }
      return undefined;
    }

    case 'password': {
      const val = values.password.trim();
      if (!isEditMode && !val) {
        return 'Password wajib diisi untuk membuat akun warga.';
      }
      if (val.length > 0 && val.length < 4) {
        return 'Password minimal 4 karakter.';
      }
      if (val.length > 50) {
        return 'Password maksimal 50 karakter.';
      }
      return undefined;
    }

    default:
      return undefined;
  }
};

export const validateResidentForm = (
  values: ResidentFormValues,
  options: {
    isEditMode: boolean;
    editingId?: string | null;
    existingResidents?: Resident[];
  }
): ResidentFormErrors => {
  const fields: ResidentFormField[] = [
    'name',
    'propertyType',
    'block',
    'houseNumber',
    'monthlyDues',
    'phone',
    'idLogin',
    'password',
  ];

  const errors: ResidentFormErrors = {};
  for (const field of fields) {
    const err = validateResidentField(field, values, options);
    if (err) {
      errors[field] = err;
    }
  }
  return errors;
};

const VALID_APP_VIEWS: readonly AppView[] = [
  'dashboard',
  'residents',
  'payments',
  'reports',
  'settings',
];

const getNotificationViewLabel = (view: AppView, role?: UserRole): string => {
  switch (view) {
    case 'payments':
      return role === 'admin' ? 'Buka Kelola Iuran' : 'Buka Bayar Iuran';
    case 'reports':
      return 'Buka Laporan Keuangan';
    case 'residents':
      return 'Buka Data Warga';
    case 'settings':
      return 'Buka Pengaturan';
    case 'dashboard':
    default:
      return 'Buka Beranda';
  }
};

export const resolveNotificationTarget = (
  notif: Pick<AppNotification, 'id' | 'title' | 'message' | 'targetView'>,
  role?: UserRole
): { view: AppView; label: string } => {
  if (notif.targetView && VALID_APP_VIEWS.includes(notif.targetView)) {
    return {
      view: notif.targetView,
      label: getNotificationViewLabel(notif.targetView, role),
    };
  }

  const id = (notif.id || '').toLowerCase();
  const combined = `${notif.id || ''} ${notif.title || ''} ${notif.message || ''}`.toLowerCase();

  let detectedView: AppView = 'dashboard';

  if (
    id.startsWith('reminder_iuran') ||
    /(iuran|pembayaran|transfer|bukti|verifikasi|tertunda|lunas|bayar|tagihan)/i.test(combined)
  ) {
    detectedView = 'payments';
  } else if (/(pengeluaran|laporan|kas|saldo|rekap|keuangan|belanja|pemasukan)/i.test(combined)) {
    detectedView = 'reports';
  } else if (/(warga|penghuni|rumah|ruko|blok|unit)/i.test(combined)) {
    detectedView = 'residents';
  } else if (/(rekening|pengaturan|password|kata sandi|profil|tema|bank)/i.test(combined)) {
    detectedView = 'settings';
  }

  return {
    view: detectedView,
    label: getNotificationViewLabel(detectedView, role),
  };
};

export const isNotificationReadForUser = (
  notif: Pick<AppNotification, 'read' | 'readBy'>,
  uid?: string | null
): boolean => {
  if (Array.isArray(notif.readBy)) {
    return uid ? notif.readBy.includes(uid) : false;
  }
  return Boolean(notif.read);
};

export const isNotificationVisibleForUser = (
  notif: Pick<AppNotification, 'audience' | 'recipientResidentId'>,
  user?: Pick<AppUser, 'uid' | 'role' | 'residentId'> | null,
  linkedResidentId?: string | null
): boolean => {
  if (!user) return false;
  if (!notif.audience || notif.audience === 'all') return true;
  if (notif.audience === 'admin') {
    return user.role === 'admin';
  }
  if (notif.audience === 'resident') {
    if (user.role !== 'resident') return false;
    if (notif.recipientResidentId) {
      const targetResidentId = linkedResidentId || user.residentId;
      return Boolean(targetResidentId && targetResidentId === notif.recipientResidentId);
    }
    return true;
  }
  return true;
};

export const normalizeWhatsAppDigits = (rawPhone: string): string => {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
};

export const formatWhatsAppUrl = (rawPhone: string): string | null => {
  const digits = normalizeWhatsAppDigits(rawPhone);
  if (digits.length < 9 || digits.length > 16) {
    return null;
  }
  return `https://wa.me/${digits}`;
};

export const validateWhatsAppNumber = (rawPhone: string): string | undefined => {
  const trimmed = (rawPhone || '').trim();
  if (!trimmed) {
    return 'Nomor WhatsApp wajib diisi.';
  }
  if (!/^[0-9+\-\s()]+$/.test(trimmed)) {
    return 'Nomor WhatsApp hanya boleh berisi angka dan simbol +, -, spasi.';
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) {
    return 'Nomor WhatsApp harus terdiri dari 9 hingga 15 digit.';
  }
  if (!/^(08|628|8|0[2-9]|62[2-9])/.test(digits)) {
    return 'Gunakan format nomor WhatsApp yang valid (misal 08... atau 628...).';
  }
  return undefined;
};


