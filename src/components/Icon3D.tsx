import React from 'react';
import { LucideIcon } from 'lucide-react';

export type Icon3DVariant =
  | 'blue'
  | 'softBlue'
  | 'emerald'
  | 'softEmerald'
  | 'amber'
  | 'softAmber'
  | 'rose'
  | 'softRose'
  | 'maroon'
  | 'softMaroon'
  | 'slate'
  | 'glass';

export type Icon3DSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface Icon3DProps {
  icon: LucideIcon;
  variant?: Icon3DVariant;
  size?: Icon3DSize;
  className?: string;
  iconClassName?: string;
}

const VARIANT_CLASSES: Record<Icon3DVariant, string> = {
  blue: 'bg-[#0088f8] text-white',
  softBlue:
    'bg-[#eaf4fe] text-[#0078e0] border border-blue-200/80 dark:bg-[#152843] dark:text-[#60b5ff] dark:border-blue-400/25',
  emerald: 'bg-[#10b981] text-white',
  softEmerald:
    'bg-emerald-50 text-emerald-600 border border-emerald-200/80 dark:bg-[#0f2f27] dark:text-emerald-400 dark:border-emerald-400/25',
  amber: 'bg-[#f59e0b] text-white',
  softAmber:
    'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-[#322411] dark:text-amber-300 dark:border-amber-400/25',
  rose: 'bg-[#f43f5e] text-white',
  softRose:
    'bg-rose-50 text-rose-600 border border-rose-200/80 dark:bg-[#32131d] dark:text-rose-400 dark:border-rose-400/25',
  maroon: 'bg-[#800020] text-white',
  softMaroon:
    'bg-[#fdf2f4] text-[#800020] border border-[#800020]/20 dark:bg-[#2e0c16] dark:text-rose-300 dark:border-rose-500/25',
  slate:
    'bg-slate-100 text-slate-600 border border-slate-200/80 dark:bg-[#1b2940] dark:text-slate-300 dark:border-slate-700/80',
  glass: 'bg-white/20 text-white border border-white/25',
};

const SIZE_CLASSES: Record<Icon3DSize, { box: string; icon: string }> = {
  xs: { box: 'w-7 h-7 aspect-square rounded-[10px]', icon: 'w-[18px] h-[18px] stroke-[2]' },
  sm: { box: 'w-8 h-8 aspect-square rounded-xl', icon: 'w-5 h-5 stroke-[2]' },
  md: { box: 'w-10 h-10 aspect-square rounded-[14px]', icon: 'w-6 h-6 stroke-[2]' },
  lg: { box: 'w-11 h-11 aspect-square rounded-2xl', icon: 'w-[26px] h-[26px] stroke-[2]' },
  xl: { box: 'w-14 h-14 aspect-square rounded-2xl', icon: 'w-8 h-8 stroke-[2]' },
};

export const Icon3D: React.FC<Icon3DProps> = React.memo(({
  icon: Icon,
  variant = 'softBlue',
  size = 'md',
  className = '',
  iconClassName = '',
}) => {
  const sizeSpec = SIZE_CLASSES[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden select-none transition-colors duration-150 ${sizeSpec.box} ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <Icon className={`relative z-10 ${sizeSpec.icon} ${iconClassName}`} />
    </div>
  );
});

Icon3D.displayName = 'Icon3D';
