import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors w-full lg:w-auto min-h-[44px] cursor-pointer"
      >
        <Download className="w-4 h-4 icon-3d-glyph" />
        <span>Instal Grand Hannan</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#18263d] w-full lg:w-auto min-h-[44px] transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 icon-3d-glyph-soft" />
          <span>Instal Grand Hannan</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#111c2e] p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Instal Grand Hannan di iPhone / iPad</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Ketuk tombol <strong>Share (Bagikan)</strong> di bawah layar Safari.<br />
                2. Geser ke bawah dan ketuk <strong>Add to Home Screen (Tambahkan ke Layar Utama)</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-2xl bg-slate-100 dark:bg-[#18263d] py-2.5 px-4 text-sm font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#1f304d] min-h-[44px] transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
