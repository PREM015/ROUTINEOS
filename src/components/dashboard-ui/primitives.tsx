'use client';

/**
 * Small shared pieces: a pill, an empty state, a progress bar.
 *
 * Kept in one file because each is a handful of lines and they are always used
 * together - a card has a header, a body, maybe an empty state and maybe a bar.
 */

import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { RADIUS } from './tokens';
import { cn } from '@/lib/utils';

export function Tag({
  children,
  tone = 'default',
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
  title?: string;
}) {
  const tones = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    danger: 'bg-destructive/10 text-destructive',
  } as const;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 px-2 py-0.5 text-[11px] font-medium tabular-nums',
        'rounded-[9999px]',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function PanelEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <>
      {icon ?? <Inbox className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-[28ch] text-xs text-muted-foreground">{description}</p>
      )}
      {action}
    </>
  );
}

/**
 * The percentage bar used by every progress figure on the page.
 *
 * `role="progressbar"` with the full value triple, because a bare width style
 * is invisible to a screen reader - the visual and the accessible value are
 * generated from the same `value` so they cannot drift.
 */
export function PanelBar({
  value,
  className,
  barClassName,
  label,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-500 ease-out-expo motion-reduce:transition-none',
          barClassName
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export { RADIUS };
