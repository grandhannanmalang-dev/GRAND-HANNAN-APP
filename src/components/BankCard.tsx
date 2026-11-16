import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Copy, Check, CheckCheck, Landmark } from 'lucide-react';
import { BankAccount } from '../types';
import { formatIDR } from '../utils';
import { Icon3D } from './Icon3D';

interface BankCardProps {
  bankAccount: BankAccount;
  nominal?: number;
  variant?: 'card' | 'compact' | 'banner';
  className?: string;
}

export const BankCard: React.FC<BankCardProps> = ({
  bankAccount,
  nominal,
  variant = 'card',
  className = '',
}) => {
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedNominal, setCopiedNominal] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const copyText = async (text: string, type: 'account' | 'nominal') => {
    const toCopy = type === 'account' ? text.replace(/\s+/g, '') : text;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(toCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = toCopy;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      if (type === 'account') {
        setCopiedAccount(true);
        setTimeout(() => setCopiedAccount(false), 2200);
      } else {
        setCopiedNominal(true);
        setTimeout(() => setCopiedNominal(false), 2200);
      }
    } catch (err) {
      console.error('Gagal menyalin:', err);
    }
  };

  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 bg-white dark:bg-[#111c2e] border border-slate-200/70 dark:border-slate-800/90 text-slate-900 dark:text-slate-100 rounded-3xl shadow-xs transition-colors ${className}`}>
        <div className="flex items-center gap-3 min-w-0">
          <Icon3D icon={Landmark} size="lg" variant="blue" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wide text-[#0088f8] dark:text-[#60b5ff]">{bankAccount.bankName}</span>
              <span className="text-slate-500 dark:text-slate-400 truncate">a.n. {bankAccount.accountName}</span>
            </div>
            <p className="font-mono font-bold text-sm tracking-wide text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
              {bankAccount.accountNumber}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => copyText(bankAccount.accountNumber, 'account')}
          className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-white font-bold text-xs rounded-2xl transition-colors cursor-pointer min-h-[44px] whitespace-nowrap shrink-0 ${
            copiedAccount ? 'bg-emerald-600' : 'bg-[#0088f8] hover:bg-[#0070e0]'
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copiedAccount ? 'copied' : 'copy'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0.06 : 0.14 }}
              className="inline-flex items-center gap-1.5"
            >
              {copiedAccount ? (
                <>
                  <Check className="w-4 h-4 icon-3d-glyph" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 icon-3d-glyph" />
                  <span>Salin No. Rek</span>
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl bg-white dark:bg-[#111c2e] text-slate-900 dark:text-slate-100 p-5 sm:p-6 shadow-xs border border-slate-200/70 dark:border-slate-800/90 transition-colors ${className}`}>
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Icon3D icon={Landmark} size="lg" variant="blue" />
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Rekening Pembayaran Iuran</p>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              Bank {bankAccount.bankName}
            </h3>
          </div>
        </div>
        <span className="text-xs font-semibold text-[#0088f8] dark:text-[#60b5ff]">Resmi Paguyuban</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Nomor Rekening</p>
          <p className="font-mono text-xl sm:text-2xl font-bold tracking-wide text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {bankAccount.accountNumber}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Atas Nama</p>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
            {bankAccount.accountName}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
        <button
          type="button"
          onClick={() => copyText(bankAccount.accountNumber, 'account')}
          className={`w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-colors cursor-pointer min-h-[44px] ${
            copiedAccount
              ? 'bg-emerald-600 text-white'
              : 'bg-[#0088f8] hover:bg-[#0070e0] text-white'
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copiedAccount ? 'copied-acc' : 'copy-acc'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0.06 : 0.14 }}
              className="inline-flex items-center gap-2"
            >
              {copiedAccount ? (
                <>
                  <CheckCheck className="w-4 h-4 icon-3d-glyph" />
                  <span>Nomor Rekening Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 icon-3d-glyph" />
                  <span>Salin No. Rekening</span>
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </button>

        {nominal !== undefined && (
          <button
            type="button"
            onClick={() => copyText(nominal.toString(), 'nominal')}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-semibold text-xs sm:text-sm transition-colors border cursor-pointer min-h-[44px] ${
              copiedNominal
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/70'
                : 'bg-slate-50 dark:bg-[#18263d] hover:bg-slate-100 dark:hover:bg-[#1f304d] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copiedNominal ? 'copied-nom' : 'copy-nom'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0.06 : 0.14 }}
                className="inline-flex items-center gap-2"
              >
                {copiedNominal ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 icon-3d-glyph-soft" />
                    <span>Nominal Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400 icon-3d-glyph-soft" />
                    <span className="tabular-nums">Salin Nominal ({formatIDR(nominal)})</span>
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-3">
        Nomor rekening disalin tanpa spasi agar langsung dapat ditempel di aplikasi mobile banking.
      </p>
    </div>
  );
};
