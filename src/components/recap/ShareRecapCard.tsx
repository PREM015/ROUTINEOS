'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Share2, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ShareStat {
  label: string;
  value: string;
}

interface ShareRecapCardProps {
  periodLabel: string;
  /** "day" | "week" | "month" | "year" — used for the sentence and the title. */
  periodNoun: string;
  stats: ShareStat[];
}

export function buildSummary(periodLabel: string, stats: ShareStat[]): string {
  const lines = stats.map((stat) => `${stat.label}: ${stat.value}`);
  return [`My RoutineOS ${periodLabel}`, ...lines, 'Made with daily-plan'].join('\n');
}

/**
 * Copy the recap as plain text.
 *
 * Three states rather than two, because "the clipboard is unavailable" and "it
 * worked" were previously indistinguishable: the catch reset `copied` to false
 * and said nothing, so on an insecure origin or inside an embedded webview the
 * button silently did nothing. `navigator.clipboard` is undefined in both cases
 * rather than throwing, which is why the guard is an existence check and not
 * only a try/catch.
 *
 * The user also gets to see and prune the exact text first. The previous
 * version copied four numbers the user had never looked at and could not
 * influence — this is a share surface, so what leaves the page is the user's
 * decision, not the component's.
 */
export default function ShareRecapCard({ periodLabel, periodNoun, stats }: ShareRecapCardProps) {
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());

  const included = useMemo(
    () => stats.filter((stat) => !excluded.has(stat.label)),
    [excluded, stats]
  );

  const summary = useMemo(
    () => buildSummary(periodLabel, included),
    [periodLabel, included]
  );

  const toggle = (label: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const copy = async () => {
    setFailure(null);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setFailure('Could not reach the clipboard. Select the preview below and copy it manually.');
    }
  };

  return (
    <section className="rounded-2xl py-1">
      <div className="rounded-2xl bg-gradient-to-br from-primary/70 via-primary/30 to-transparent p-px">
        <div className="glass-panel relative overflow-hidden rounded-2xl p-6">
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
            aria-hidden="true"
          />

          <p className="shimmer-active inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Share your recap
          </p>

          <h2 className="mt-4 text-2xl font-black text-foreground">{periodLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A quick, honest summary of your {periodNoun}. Choose what goes in.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {stats.map((stat) => {
              const isExcluded = excluded.has(stat.label);
              return (
                <div
                  key={stat.label}
                  className={cn(
                    'rounded-xl bg-card/70 p-3 transition-opacity',
                    isExcluded && 'opacity-40'
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                    <button
                      type="button"
                      onClick={() => toggle(stat.label)}
                      aria-pressed={isExcluded}
                      className="-mt-0.5 -mr-0.5 shrink-0 rounded p-1 text-[10px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <span className="sr-only">
                        {isExcluded ? `Include ${stat.label}` : `Exclude ${stat.label}`}
                      </span>
                      <span aria-hidden="true">{isExcluded ? 'Add' : 'Remove'}</span>
                    </button>
                  </div>
                  <dd className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                    {stat.value}
                  </dd>
                </div>
              );
            })}
          </div>

          {/*
            The literal text. Selectable, so a failure above is still recoverable,
            and visible before anything is copied rather than after.
          */}
          <details className="mt-4 group">
            <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Preview the text
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 font-mono text-xs text-muted-foreground">
              {summary}
            </pre>
          </details>

          <button
            onClick={copy}
            className="light-sweep glow-neon mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-300 ease-out-expo hover:scale-[1.02] active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" /> Copied to clipboard
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" /> Copy summary to share
              </>
            )}
          </button>

          {/* Announced, because a failure the user cannot see is not feedback. */}
          {failure && (
            <p
              role="status"
              className="mt-3 flex items-start justify-center gap-1.5 text-center text-[11px] text-amber-600 dark:text-amber-400"
            >
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {failure}
            </p>
          )}

          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Share2 className="h-3 w-3" aria-hidden="true" />
            Paste it anywhere — messages, notes, social
          </p>
        </div>
      </div>
    </section>
  );
}