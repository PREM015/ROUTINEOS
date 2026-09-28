'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useApp } from '@/context/useApp';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * Global surface for `AppContext.dataError`.
 *
 * `dataError` was set on every failed load in `fetchAll` and `fetchHabitLogs`
 * but **no component ever read it**, so the entire error surface was dead: when
 * the shared habits/routine/goals fetch failed, every page rendered a confident
 * empty state — "No habits scheduled for today", "No goals set yet" — which
 * reads as data loss rather than as an error. This banner is what makes those
 * failures visible.
 *
 * Rendered once, high in the tree, so a single failed fetch is reported on
 * every page that depends on it instead of only where it happened.
 */
export function DataErrorBanner({ className }: { className?: string }) {
  const { dataError, reloadData } = useApp();
  const [dismissed, setDismissed] = React.useState<string | null>(null);

  if (!dataError || dismissed === dataError) return null;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">Could not load your data. </span>
        <span className="opacity-90">{dataError}</span>{' '}
        <span className="opacity-80">Anything not shown below may be missing rather than empty.</span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void reloadData()}
        className="shrink-0"
      >
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(dataError)}
        className="shrink-0 rounded p-1 hover:bg-destructive/10"
        aria-label="Dismiss error"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default DataErrorBanner;
