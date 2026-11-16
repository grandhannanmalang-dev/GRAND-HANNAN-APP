import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../AppContext';
import {
  getMonthName,
  formatIDR,
  generateId,
  compressImage,
  resolveResidentPaymentForMonth,
  normalizePaymentStatus,
  safeTimeMs,
  safeFormatDate,
  translateErrorToIndonesian
} from '../utils';
import {
  CheckCircle2,
  Clock,
  Hourglass,
  AlertTriangle,
  Upload,
  FileImage,
  Loader2,
  CalendarClock,
  X,
  Home,
  ImageUp,
  Camera,
  RefreshCw,
  Check
} from 'lucide-react';
import { Payment } from '../types';
import { BankCard } from './BankCard';
import { Icon3D } from './Icon3D';

export const ResidentDashboard: React.FC = () => {
  const { currentUser, residents, payments, addPayment, addNotification, bankAccount } = useAppContext();

  const [isUploading, setIsUploading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [previewProof, setPreviewProof] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Camera capture modal state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string>('');
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [capturedImageDataUrl, setCapturedImageDataUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const resident = useMemo(
    () => residents.find(r => r.userId === currentUser?.uid || r.id === currentUser?.residentId),
    [residents, currentUser?.uid, currentUser?.residentId]
  );

  const residentId = resident?.id;
  const myPayments = useMemo(
    () =>
      residentId
        ? payments
            .filter(p => p.residentId === residentId)
            .sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date))
        : [],
    [payments, residentId]
  );

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isCameraOpen || capturedImageDataUrl) {
      stopCameraStream();
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Browser atau perangkat tidak mendukung pratinjau kamera langsung. Gunakan tombol Kamera Perangkat di bawah.');
        return;
      }

      setCameraError('');
      setIsStartingCamera(true);
      stopCameraStream();

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: cameraFacingMode },
              width: { ideal: 1280 },
              height: { ideal: 960 },
            },
            audio: false,
          });
        } catch {
          // Fallback to any available camera if ideal constraints fail
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const errName = err instanceof Error ? err.name : '';
          if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
            setCameraError('Izin akses kamera ditolak. Aktifkan izin kamera pada browser atau gunakan tombol Kamera Perangkat di bawah.');
          } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
            setCameraError('Kamera tidak ditemukan pada perangkat ini. Silakan gunakan tombol Kamera Perangkat atau upload gambar.');
          } else {
            setCameraError('Tidak dapat membuka kamera langsung. Gunakan tombol Kamera Perangkat di bawah.');
          }
        }
      } finally {
        if (!cancelled) {
          setIsStartingCamera(false);
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [isCameraOpen, cameraFacingMode, capturedImageDataUrl]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  if (!resident) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-[#111c2e] rounded-3xl border border-slate-200/70 dark:border-slate-800/90">
        Data warga tidak ditemukan. Silakan hubungi admin paguyuban.
      </div>
    );
  }

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const currentMonthPayment = resolveResidentPaymentForMonth(payments, resident.id, currentMonth, currentYear);
  const currentMonthStatus = currentMonthPayment ? normalizePaymentStatus(currentMonthPayment) : 'unpaid';

  const selectedMonthPayment = resolveResidentPaymentForMonth(payments, resident.id, selectedMonth, selectedYear);
  const selectedStatus = selectedMonthPayment ? normalizePaymentStatus(selectedMonthPayment) : 'unpaid';

  const processPaymentFile = async (file: File, options?: { fromCamera?: boolean }) => {
    setUploadFeedback(null);

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (file.type && !allowedTypes.includes(file.type.toLowerCase())) {
      setUploadFeedback({
        type: 'error',
        text: 'Format file tidak didukung. Gunakan gambar JPG, JPEG, PNG, atau WebP.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
      return;
    }

    // Standard file upload max 5MB; direct camera photo has no size limit and is auto-compressed
    if (!options?.fromCamera) {
      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        setUploadFeedback({
          type: 'error',
          text: `Ukuran gambar maksimal 5MB. File yang Anda pilih berukuran ${(file.size / (1024 * 1024)).toFixed(2)} MB.`
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setIsUploading(true);

    try {
      const compressedBase64 = await compressImage(file, 1200, 0.78);

      const newPayment: Payment = {
        id: selectedMonthPayment?.id || `p_${generateId()}`,
        residentId: resident.id,
        amount: resident.monthlyDues || 150000,
        month: Number(selectedMonth),
        year: Number(selectedYear),
        date: new Date().toISOString(),
        proofOfPayment: compressedBase64,
        status: 'pending'
      };

      await addPayment(newPayment);

      try {
        await addNotification(
          'Bukti Pembayaran Baru',
          `${resident.name} (${resident.propertyType}${resident.block ? ` Blok ${resident.block}` : ''} No ${resident.houseNumber}) mengunggah bukti pembayaran iuran ${getMonthName(selectedMonth)} ${selectedYear}.`,
          {
            targetView: 'payments',
            audience: 'admin',
            recipientResidentId: resident.id,
            category: 'payment',
          }
        );
      } catch (notifErr) {
        console.warn('Gagal mengirim notifikasi pembayaran ke admin:', notifErr);
      }

      setUploadFeedback({
        type: 'success',
        text: `Bukti pembayaran periode ${getMonthName(selectedMonth)} ${selectedYear} berhasil dikirim dan menunggu verifikasi Admin.`
      });
    } catch (err: unknown) {
      console.error('Error uploading payment:', err);
      setUploadFeedback({
        type: 'error',
        text: translateErrorToIndonesian(err, 'Gagal mengunggah bukti pembayaran.')
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPaymentFile(file, { fromCamera: false });
  };

  const handleNativeCameraUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCameraOpen(false);
    setCapturedImageDataUrl(null);
    setCapturedFile(null);
    await processPaymentFile(file, { fromCamera: true });
  };

  const handleOpenCamera = () => {
    setCapturedImageDataUrl(null);
    setCapturedFile(null);
    setCameraError('');
    setIsCameraOpen(true);
  };

  const handleCloseCamera = () => {
    stopCameraStream();
    setIsCameraOpen(false);
    setCapturedImageDataUrl(null);
    setCapturedFile(null);
    setCameraError('');
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Pratinjau kamera belum siap. Tunggu sebentar lalu coba lagi.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCameraError('Gagal mengambil gambar dari kamera.');
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImageDataUrl(dataUrl);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedFile(new File([blob], `bukti-kamera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        }
      },
      'image/jpeg',
      0.9
    );
    stopCameraStream();
  };

  const handleConfirmCapturedPhoto = async () => {
    if (!capturedFile) return;
    const fileToUpload = capturedFile;
    handleCloseCamera();
    await processPaymentFile(fileToUpload, { fromCamera: true });
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processPaymentFile(file, { fromCamera: false });
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading && !isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const renderDualUploadZone = () => (
    <div className="relative w-full">
      {!isUploading && !isDragOver && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[3px] rounded-[18px] border-2 border-[#0088f8]/45 dark:border-[#60b5ff]/50 animate-upload-ring-pulse"
        />
      )}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-full rounded-2xl border-2 border-dashed p-4 sm:p-5 flex flex-col items-center justify-center gap-3.5 text-center transition-colors duration-150 ${
          isDragOver
            ? 'border-[#0088f8] dark:border-[#60b5ff] bg-[#e8f4fd] dark:bg-[#1a3254]'
            : 'border-[#0088f8]/45 dark:border-[#60b5ff]/45 bg-[#edf6fe]/65 dark:bg-[#152843]/60'
        }`}
      >
        {isUploading ? (
          <div className="py-4 flex flex-col items-center gap-2.5">
            <Loader2 className="w-7 h-7 text-[#0088f8] dark:text-[#60b5ff] animate-spin" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Mengompresi & Mengunggah...
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mohon tunggu sebentar
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {isDragOver ? 'Lepaskan file bukti transfer di sini' : 'Pilih Metode Unggah Bukti Transfer'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload gambar dari galeri (maks. 5MB) atau foto langsung lewat kamera smartphone
              </p>
            </div>

            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-white dark:bg-[#111c2e] hover:bg-blue-50 dark:hover:bg-[#1f3252] border border-blue-200 dark:border-blue-500/35 text-[#0070e0] dark:text-[#60b5ff] font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>Upload Gambar (Maks. 5MB)</span>
              </button>

              <button
                type="button"
                disabled={isUploading}
                onClick={handleOpenCamera}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#0088f8] hover:bg-[#0070e0] text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>Foto Langsung (Kamera)</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Pembayaran Iuran
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Informasi tagihan, rekening paguyuban, dan unggah bukti transfer
        </p>
      </div>

      {/* Pengingat Pembayaran Rutin Tanggal 1 (Strictly checks verified status!) */}
      {currentMonthStatus !== 'verified' ? (
        <div className="bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-700/40 rounded-3xl p-5 sm:p-6 transition-colors">
          <div className="flex items-start gap-3.5">
            <Icon3D icon={CalendarClock} size="lg" variant="amber" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                Pengingat Tanggal 1 · Periode {getMonthName(currentMonth)} {currentYear}
              </p>
              <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base mt-1">
                {currentMonthStatus === 'pending'
                  ? 'Bukti Pembayaran Sedang Diverifikasi Admin'
                  : currentMonthStatus === 'tertunda'
                  ? 'Tagihan Iuran Bulan Ini Berstatus Tertunda'
                  : 'Jadwal Pembayaran Iuran Bulanan Warga'}
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                {currentMonthStatus === 'pending'
                  ? 'Bukti transfer Anda telah diterima dan sedang menunggu konfirmasi lunas dari pengurus paguyuban.'
                  : 'Setiap tanggal 1 awal bulan adalah jadwal pembayaran iuran warga Grand Hannan. Silakan transfer ke rekening paguyuban dan unggah bukti transfer di bawah.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-700/40 rounded-3xl p-4 flex items-center gap-3.5 transition-colors">
          <Icon3D icon={CheckCircle2} size="md" variant="emerald" />
          <p className="text-sm text-emerald-900 dark:text-emerald-200 font-medium">
            Terima kasih! Iuran bulan <strong>{getMonthName(currentMonth)} {currentYear}</strong> Anda telah terverifikasi lunas.
          </p>
        </div>
      )}

      {/* Feedback Banner */}
      {uploadFeedback && (
        <div className={`p-4 rounded-2xl border flex items-start justify-between gap-3 text-xs sm:text-sm font-medium ${
          uploadFeedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
            : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
        }`}>
          <div className="flex items-start gap-2.5">
            {uploadFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{uploadFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadFeedback(null)}
            className="icon-btn-md hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Tutup pesan"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      )}

      {/* Info Warga Card */}
      <div className="bg-white dark:bg-[#111c2e] p-5 sm:p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800/90 shadow-xs flex flex-col justify-between transition-colors">
        <div>
          <div className="flex items-center gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
            <Icon3D icon={Home} size="md" variant="softBlue" />
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Informasi Properti
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Unit hunian Anda di Grand Hannan</p>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Nama Penghuni</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{resident.name}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-slate-100 dark:border-slate-800 pt-2.5">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Tipe Properti</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{resident.propertyType}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-slate-100 dark:border-slate-800 pt-2.5">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Nomor / Blok</span>
              <span className="font-bold text-[#0088f8] dark:text-[#60b5ff]">
                {resident.propertyType === 'Perumahan'
                  ? `${resident.block ? `Blok ${resident.block} ` : ''}No. ${resident.houseNumber}`
                  : `No. ${resident.houseNumber}`}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-slate-100 dark:border-slate-800 pt-2.5">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Iuran Bulanan</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 text-base tabular-nums">
                {formatIDR(resident.monthlyDues || 150000)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-slate-100 dark:border-slate-800 pt-2.5">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Status Bulan Ini</span>
              {currentMonthStatus === 'verified' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 icon-3d-glyph-soft" /> Lunas
                </span>
              ) : currentMonthStatus === 'pending' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0070e0] dark:text-[#60b5ff]">
                  <Hourglass className="w-4 h-4 icon-3d-glyph-soft" /> Menunggu Verifikasi
                </span>
              ) : currentMonthStatus === 'tertunda' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 icon-3d-glyph-soft" /> Tertunda
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                  <Clock className="w-4 h-4 icon-3d-glyph-soft" /> Belum Bayar
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 p-3.5 rounded-2xl bg-[#edf6fe]/70 dark:bg-[#152843]/80 border border-blue-100 dark:border-blue-500/20 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Pembayaran iuran mencakup kebersihan, keamanan 24 jam, dan pemeliharaan fasilitas umum.
        </div>
      </div>

      {/* Rekening Tujuan Box */}
      <BankCard
        bankAccount={bankAccount}
        nominal={resident.monthlyDues || 150000}
      />

      {/* Form Pembayaran Card */}
      <div className="bg-white dark:bg-[#111c2e] p-5 sm:p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800/90 shadow-xs flex flex-col justify-between transition-colors">
        <div>
          <div className="flex items-center gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
            <Icon3D icon={ImageUp} size="md" variant="softBlue" />
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Unggah Bukti Transfer
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pilih periode lalu upload gambar (maks. 5MB) atau foto langsung kamera</p>
            </div>
          </div>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Bulan</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 min-h-[44px] border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/30 bg-slate-50 dark:bg-[#18263d] text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-semibold appearance-none cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Tahun</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 min-h-[44px] border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0088f8]/30 bg-slate-50 dark:bg-[#18263d] text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-semibold appearance-none cursor-pointer tabular-nums"
                >
                  {Array.from({ length: 22 }, (_, i) => currentYear - 1 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* File gallery input (max 5MB) */}
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg,image/webp"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Native smartphone camera fallback input (unlimited size, auto-compressed) */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={nativeCameraInputRef}
              className="hidden"
              onChange={handleNativeCameraUpload}
            />

            {selectedStatus !== 'unpaid' ? (
              <div className={`p-4 rounded-2xl border flex flex-col gap-3 ${
                selectedStatus === 'tertunda'
                  ? 'bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 border-amber-200/80 dark:border-amber-700/40'
                  : selectedStatus === 'pending'
                  ? 'bg-blue-50/70 dark:bg-[#152843]/80 text-slate-900 dark:text-slate-100 border-blue-200 dark:border-blue-500/30'
                  : 'bg-emerald-50 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700/40'
              }`}>
                <div className="flex gap-3 items-start">
                  {selectedStatus === 'tertunda' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0 icon-3d-glyph-soft" />
                  ) : selectedStatus === 'pending' ? (
                    <Hourglass className="w-5 h-5 text-[#0088f8] dark:text-[#60b5ff] mt-0.5 shrink-0 icon-3d-glyph-soft" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0 icon-3d-glyph-soft" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm">
                        {selectedStatus === 'tertunda'
                          ? 'Tagihan Tertunda'
                          : selectedStatus === 'pending'
                          ? 'Menunggu Verifikasi Admin'
                          : 'Pembayaran Terverifikasi Lunas'}
                      </p>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-lg ${
                        selectedStatus === 'tertunda'
                          ? 'bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200'
                          : selectedStatus === 'pending'
                          ? 'bg-[#e8f4fd] dark:bg-blue-900/60 text-[#0070e0] dark:text-[#60b5ff]'
                          : 'bg-emerald-200 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200'
                      }`}>
                        {selectedStatus === 'tertunda' ? 'Tertunda' : selectedStatus === 'pending' ? 'Menunggu Verifikasi' : 'Lunas'}
                      </span>
                    </div>
                    <p className="text-xs opacity-90 mt-1 leading-relaxed">
                      {selectedStatus === 'tertunda'
                        ? 'Iuran periode ini berstatus tertunda. Silakan lakukan transfer dan unggah foto bukti transfer di bawah ini.'
                        : selectedStatus === 'pending'
                        ? 'Bukti pembayaran Anda telah terkirim dan menunggu verifikasi dari pengurus paguyuban.'
                        : 'Iuran untuk periode ini sudah selesai diverifikasi oleh pengurus.'}
                    </p>
                  </div>
                </div>

                {/* Always allow uploading proof when 'tertunda' even if proofOfPayment is empty, or viewing/re-uploading when present */}
                {(selectedStatus === 'tertunda' || selectedMonthPayment?.proofOfPayment) && (
                  <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2">
                    {selectedMonthPayment?.proofOfPayment && (
                      <button
                        type="button"
                        onClick={() => setPreviewProof(selectedMonthPayment.proofOfPayment || null)}
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#0070e0] dark:text-[#60b5ff] bg-white dark:bg-[#111c2e] px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-500/30 shadow-2xs cursor-pointer min-h-[40px] whitespace-nowrap"
                      >
                        <FileImage className="w-4 h-4 icon-3d-glyph-soft" />
                        <span>Lihat Bukti Transfer</span>
                      </button>
                    )}

                    {selectedStatus !== 'verified' && (
                      selectedStatus === 'tertunda' && !selectedMonthPayment?.proofOfPayment ? (
                        renderDualUploadZone()
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-800/70 text-amber-900 dark:text-amber-100 min-h-[40px] whitespace-nowrap"
                          >
                            {isUploading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Mengunggah...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4" />
                                <span>Upload Ulang (5MB)</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={handleOpenCamera}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 bg-[#0088f8] hover:bg-[#0070e0] text-white min-h-[40px] whitespace-nowrap"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Foto Kamera</span>
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ) : (
              renderDualUploadZone()
            )}
          </div>
        </div>
      </div>

      {/* Riwayat Pembayaran Anda Card */}
      <div className="bg-white dark:bg-[#111c2e] p-5 sm:p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800/90 shadow-xs transition-colors">
        <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-4">
          Riwayat Pembayaran Anda
        </h2>
        {myPayments.length > 0 ? (
          <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800/80">
            {myPayments.map(payment => {
              const status = normalizePaymentStatus(payment);
              return (
                <div key={payment.id} className="py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                      Periode {getMonthName(payment.month)} {payment.year}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {safeFormatDate(payment.date, {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatIDR(payment.amount)}</span>
                    {status === 'tertunda' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                        <span>Tertunda</span>
                      </span>
                    ) : status === 'pending' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#e8f4fd] dark:bg-[#1b3352] text-[#0070e0] dark:text-[#60b5ff]">
                        <Hourglass className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                        <span>Menunggu Verifikasi</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-700/50">
                        <CheckCircle2 className="w-3.5 h-3.5 icon-3d-glyph-soft" />
                        <span>Terverifikasi</span>
                      </span>
                    )}
                    {payment.proofOfPayment && (
                      <button
                        type="button"
                        onClick={() => setPreviewProof(payment.proofOfPayment || null)}
                        className="icon-btn-md text-slate-500 dark:text-slate-300 hover:text-[#0088f8] dark:hover:text-[#60b5ff] bg-slate-50 dark:bg-[#18263d] hover:bg-[#e8f4fd] dark:hover:bg-[#1f304d] border border-slate-200 dark:border-slate-700"
                        title="Lihat Bukti Transfer"
                      >
                        <FileImage className="w-4 h-4 stroke-[2] icon-3d-glyph-soft" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm font-medium">
            Belum ada riwayat pembayaran.
          </div>
        )}
      </div>

      {/* Live In-App Camera Modal (with automatic fallback to native smartphone camera) */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 dark:bg-black/90 sm:backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111c2e] rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#162339]">
              <div>
                <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">
                  Foto Bukti Transfer
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Arahkan kamera ke struk atau bukti transfer Anda
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCamera}
                className="icon-btn-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                aria-label="Tutup kamera"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center">
                {capturedImageDataUrl ? (
                  <img
                    src={capturedImageDataUrl}
                    alt="Hasil foto kamera"
                    decoding="async"
                    className="w-full h-full object-contain"
                  />
                ) : cameraError ? (
                  <div className="p-5 text-center space-y-3 text-slate-200">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                    <p className="text-xs sm:text-sm leading-relaxed">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-xs sm:text-sm font-bold cursor-pointer min-h-[44px]"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Buka Kamera Perangkat</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                    {isStartingCamera && (
                      <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center gap-2 text-white">
                        <Loader2 className="w-6 h-6 animate-spin text-[#60b5ff]" />
                        <span className="text-xs font-medium">Menyiapkan kamera...</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {capturedImageDataUrl ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCapturedImageDataUrl(null);
                      setCapturedFile(null);
                    }}
                    className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#233554] text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Foto Ulang</span>
                  </button>
                  <button
                    type="button"
                    disabled={!capturedFile || isUploading}
                    onClick={() => void handleConfirmCapturedPhoto()}
                    className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#0088f8] hover:bg-[#0070e0] text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    <span>Kirim Bukti</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setCameraFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                    className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-[#18263d] hover:bg-slate-200 dark:hover:bg-[#233554] text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Ganti Kamera Depan/Belakang"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Putar Kamera</span>
                  </button>

                  {!cameraError ? (
                    <button
                      type="button"
                      disabled={isStartingCamera}
                      onClick={handleCapturePhoto}
                      className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Ambil Foto</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCloseCamera}
                      className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-[#18263d] text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                    >
                      Batal
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview Bukti Transfer */}
      {previewProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 dark:bg-black/85 sm:backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111c2e] rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-transparent dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#162339]">
              <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">Bukti Transfer Pembayaran</h3>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="icon-btn-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-900/5 dark:bg-[#0b1220]/70 max-h-[70vh] overflow-auto">
              <img
                src={previewProof}
                alt="Bukti Transfer"
                loading="lazy"
                decoding="async"
                className="max-h-[60vh] max-w-full rounded-2xl object-contain shadow-sm border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="p-4 bg-slate-50 dark:bg-[#162339] border-t border-slate-100 dark:border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="px-5 py-2.5 min-h-[44px] bg-slate-800 dark:bg-[#1e2f4a] text-white rounded-2xl text-xs sm:text-sm font-bold hover:bg-slate-900 dark:hover:bg-[#273d5e] cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
