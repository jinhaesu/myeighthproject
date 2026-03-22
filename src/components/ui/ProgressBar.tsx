import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0 ~ 100
  className?: string;
  barClassName?: string;
}

export default function ProgressBar({
  value,
  className,
  barClassName,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      className={cn('w-full bg-gray-100 rounded-full h-1.5 overflow-hidden', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-[#1a5c2e] to-[#22c55e] transition-all duration-700 ease-out',
          barClassName
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
