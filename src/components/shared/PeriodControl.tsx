'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PERIOD_LABEL, PERIOD_ORDER, type Period } from '@/lib/period-range';

interface PeriodControlProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  todayLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Shared period navigator used by the Recap page and the dashboard Routine
 * Progress widget so both surfaces expose identical navigation semantics.
 */
export function PeriodControl({
  period,
  onPeriodChange,
  label,
  onPrev,
  onNext,
  onToday,
  todayLabel = 'Today',
  className,
  size = 'md',
}: PeriodControlProps) {
  const tabSize = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const navSize = size === 'sm' ? 'p-1' : 'p-1.5';
  const arrowClass = size === 'sm' ? 'h-4 w-4' : 'h-4 w-4';
  const labelClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const todayClass = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {PERIOD_ORDER.map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={cn(
              'rounded-md font-semibold transition-colors',
              tabSize,
              period === p
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <button
        onClick={onPrev}
        aria-label="Previous period"
        className={cn(
          'rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
          navSize
        )}
      >
        <ChevronLeft className={arrowClass} />
      </button>
      <span
        className={cn(
          'font-semibold text-foreground tabular-nums text-center min-w-[150px] break-keep',
          labelClass
        )}
      >
        {label || '\u2014'}
      </span>
      <button
        onClick={onNext}
        aria-label="Next period"
        className={cn(
          'rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
          navSize
        )}
      >
        <ChevronRight className={arrowClass} />
      </button>
      <button
        onClick={onToday}
        className={cn('font-semibold text-primary hover:underline break-keep', todayClass)}
      >
        {todayLabel}
      </button>
    </div>
  );
}