import React, { memo, useMemo } from 'react';
import { Home, Users, CreditCard, BarChart3, Building2, Settings } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAppContext } from '../AppContext';
import { AppView } from '../types';
import { Icon3D } from './Icon3D';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ViewType = AppView;

interface SidebarProps {
  currentView: ViewType;
  onChangeView: (view: ViewType) => void;
  onPrefetchView?: (view: ViewType) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = memo(({ currentView, onChangeView, onPrefetchView, isOpen, onClose }) => {
  const { currentUser, payments } = useAppContext();
  const pendingCount = useMemo(
    () => payments.filter(p => p.status === 'pending' || p.status === 'tertunda').length,
    [payments]
  );

  const shouldReduceMotion = useReducedMotion();

  const navItems = [
    { id: 'dashboard', label: 'Beranda', icon: Home },
    { id: 'residents', label: 'Data Warga', icon: Users },
    { id: 'payments', label: currentUser?.role === 'admin' ? 'Kelola Iuran' : 'Bayar Iuran', icon: CreditCard },
    { id: 'reports', label: 'Laporan Keuangan', icon: BarChart3 },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ] as const;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.08 : 0.2 }}
            className="fixed inset-0 z-20 bg-slate-900/50 dark:bg-black/70 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 w-68 bg-white dark:bg-[#111c2e] border-r border-slate-200/80 dark:border-slate-800/90 transform transition-transform duration-200 ease-out lg:translate-x-0 lg:static lg:inset-auto",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Brand Header */}
          <div className="h-[68px] flex items-center px-4 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-3 min-w-0">
              <Icon3D icon={Building2} size="lg" variant="blue" />
              <div className="min-w-0">
                <span className="font-display font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight leading-tight block truncate">
                  Grand Hannan
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block truncate">
                  Sistem Iuran Warga
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-5 px-4 space-y-1.5">
            <div className="mb-2.5 px-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Menu Navigasi
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <motion.button
                  data-no-rebound
                  whileHover={shouldReduceMotion ? undefined : { x: 2 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  key={item.id}
                  type="button"
                  onMouseEnter={() => onPrefetchView?.(item.id)}
                  onFocus={() => onPrefetchView?.(item.id)}
                  onClick={() => {
                    onChangeView(item.id);
                    onClose();
                  }}
                  className={cn(
                    "nav-menu-item",
                    isActive
                      ? "text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#18263d] hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active-bg"
                      transition={shouldReduceMotion ? { duration: 0.08 } : { type: 'spring', stiffness: 360, damping: 30 }}
                      className="absolute inset-0 rounded-2xl bg-[#0088f8]"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-3 w-full min-w-0">
                    <Icon3D icon={Icon} size="sm" variant={isActive ? 'glass' : 'slate'} />
                    <span className="truncate">{item.label}</span>
                    <AnimatePresence>
                      {item.id === 'payments' && currentUser?.role === 'admin' && pendingCount > 0 && (
                        <motion.span
                          key="sidebar-pending-badge"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: shouldReduceMotion ? 0.06 : 0.16 }}
                          className={cn(
                            "ml-auto min-w-[22px] h-[22px] px-1.5 rounded-lg inline-flex items-center justify-center text-xs font-bold tabular-nums shrink-0",
                            isActive ? "bg-white text-[#0088f8]" : "bg-amber-500 text-white"
                          )}
                        >
                          {pendingCount}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                </motion.button>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
});
Sidebar.displayName = 'Sidebar';
