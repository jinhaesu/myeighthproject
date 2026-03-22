'use client';

import { cn } from '@/lib/utils';
import type { TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export default function TextArea({
  label,
  className,
  id,
  ...props
}: TextAreaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-[#111827]"
        >
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          'rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] placeholder:text-gray-400 focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 resize-y min-h-[100px] transition-all',
          className
        )}
        {...props}
      />
    </div>
  );
}
