import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScrollableCardProps {
  title: string;
  action?: ReactNode;
  summary?: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Compact dashboard card whose list area fits exactly 3 rows (56px rows +
 * 8px gaps = 184px) and scrolls beyond that, with a bottom fade hint.
 * Card itself never grows: `overflow-hidden` + `min-h-0` keep laptop layouts
 * intact with 0, 1, 3 or 30 items.
 */
export function ScrollableCard({
  title,
  action,
  summary,
  emptyMessage = 'Nothing here yet.',
  isEmpty = false,
  children,
  className,
}: ScrollableCardProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        'bg-card border border-border rounded-xl p-4 flex flex-col min-w-0 min-h-0 overflow-hidden',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        {action}
      </div>

      {summary}

      {isEmpty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="relative min-h-0">
          <div className="slim-scroll scroll-fade overflow-y-auto overscroll-contain max-h-[184px] pr-1">
            <div className="space-y-2">{children}</div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ScrollableCard;
