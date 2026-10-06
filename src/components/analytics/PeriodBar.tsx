'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { PeriodControl } from '@/components/shared/PeriodControl';
import type { Period } from '@/lib/period-range';
import type { AnalyticsDashboard } from '@/types/analytics';
import { cn } from '@/lib/utils';

interface PeriodBarProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  anchorDate: string;
  maxAnchor: string;
  timezone: string;
  /** Id of the panel the tabs drive. See `PeriodControl.panelId`. */
  panelId: string;
  freshness: AnalyticsDashboard['freshness'];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  children?: React.ReactNode;
}

/**
 * The page's one control surface: where time travel and view control live.
 *
 * ## Why it is sticky
 *
 * Every period on this page is reached by moving through time, and every figure below
 * is scoped to that choice. Scrolling past the control to read a habit breakdown and
 * then having to scroll back to change the period is the friction that makes a report
 * feel like a document instead of an instrument. Sticky keeps the choice visible while
 * the consequences of it are being read.
 *
 * ## Why the progress line replaces the full-page dim
 *
 * Refreshing used to drop the entire tree to 60% opacity. That signalled "this data is
 * stale" by making all of it harder to read — including the numbers the user was in the
 * middle of. A line along the bottom edge of the bar says the same thing without
 * degrading the content, and it does not move anything, so there is no layout shift on
 * arrival.
 *
 * The tree keeps a very slight dim for the same signal, because the line alone is easy
 * to miss if the reader is scrolled past the bar's own row.
 */
export function PeriodBar({
  period,
  onPeriodChange,
  label,
  onPrev,
  onNext,
  onToday,
  anchorDate,
  maxAnchor,
  timezone,
  panelId,
  freshness,
  isLoading,
  error,
  onRetry,
  children,
}: PeriodBarProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    // `navigator.clipboard` is absent on an insecure origin and can be refused by
    // permission policy, so a failure here must not throw out of an onClick.
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md">
      {/*
        The progress line. `scale-x` rather than `width` so it animates on the
        compositor, and `aria-hidden` because the status text below already announces
        the same thing to assistive tech.
      */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none',
          isLoading ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
        )}
      />

      <div className="container mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <PeriodControl
            period={period}
            onPeriodChange={onPeriodChange}
            label={label}
            onPrev={onPrev}
            onNext={onNext}
            onToday={onToday}
            anchorDate={anchorDate}
            maxAnchor={maxAnchor}
            timezone={timezone}
            panelId={panelId}
          />

          <div className="flex items-center justify-end gap-2">
            <FreshnessChip freshness={freshness} />

            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>

        {/*
          Status region rather than a full-screen spinner. The previous numbers stay
          readable underneath, but the page never claims they are current while they
          are not — which is how a user ends up reading last week's average as today's.
        */}
        <p
          role="status"
          aria-live="polite"
          className="mt-1.5 flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground"
        >
          {isLoading ? (
            'Updating…'
          ) : error ? (
            <span className="text-destructive">
              {error} — showing the last loaded period.{' '}
              <button
                type="button"
                onClick={onRetry}
                className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Retry
              </button>
            </span>
          ) : null}
        </p>

        {children}
      </div>
    </div>
  );
}

/**
 * Says so when the scores behind this period are incomplete.
 *
 * Scores come from a bounded nightly job, so a period can hold days nobody has got to.
 * The alternative was a page that quietly averaged whatever existed and called it the
 * period — which reads as a decline when the truth is that four days are missing.
 *
 * Appears only when something is missing, so the common case stays quiet. The gate is
 * the server's: it reports zero for a period containing no score at all, which covers
 * today before the 01:00 run and any period predating the account. Both are absences of
 * data rather than a lagging job, and the hero's dashed "No score recorded" ring is the
 * honest thing to show for them.
 */
function FreshnessChip({ freshness }: { freshness: AnalyticsDashboard['freshness'] }) {
  if (freshness.unscoredDays === 0) return null;

  const explanation =
    `Scores are computed by a nightly job. ${freshness.unscoredDays} of the ` +
    `${freshness.elapsedDays} elapsed ${freshness.elapsedDays === 1 ? 'day has' : 'days have'} ` +
    'no score yet, so the average covers fewer days than the period.' +
    (freshness.latestScoredDate ? ` Newest score: ${freshness.latestScoredDate}.` : '') +
    ' Days still unscored can be computed on demand from Today.';

  return (
    <p
      title={explanation}
      className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">
        {freshness.unscoredDays} of {freshness.elapsedDays} not scored
      </span>
      <span className="sr-only">{explanation}</span>
    </p>
  );
}
