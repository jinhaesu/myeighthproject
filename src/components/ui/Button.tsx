'use client';

import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-[#1a5c2e] text-white hover:bg-[#144723] shadow-sm hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 focus:ring-[#1a5c2e]/30',
  secondary:
    'bg-white text-[#111827] border border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:-translate-y-[1px] shadow-sm hover:shadow-md active:translate-y-0 focus:ring-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 hover:-translate-y-[1px] shadow-sm hover:shadow-md active:translate-y-0 focus:ring-red-500/30',
  ghost: 'bg-transparent text-[#6b7280] hover:bg-gray-100 hover:text-[#111827] focus:ring-gray-200',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
