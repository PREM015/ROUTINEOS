'use client';

/**
 * AI Insight of the Day — one card, one sentence, one action.
 *
 * The spec is blunt about the old card: "Not a wall of text — one card, one
 * sentence, one suggested action button". The previous version rendered the full
 * summary plus up to 2 wins plus up to 3 suggestions, which is the entire
 * weekly narrative compressed into a sidebar slot.
 *
 * So the summary is condensed to a single lead line and the rest lives behind a
 * disclosure. `nextPeriodFocus` — which the model has always populated and the
 * old card **discarded** — is the suggested action.
 *
 * The empty/off state is an invitation, not a dead space, per the spec: the
 * widget defaults to `enabled: false`, so a fresh browser sees this card and it
 * has to earn its place.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { DOMAIN_ACCENT, accentTint } from '@/components/dashboard-ui/accent';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { getTodayString, shiftCalendarDay } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface Insight {
  id: string;
  summary: string;
  wins: string | null;
  suggestions: string | null;
  /** One string, written by the model, previously fetched and discarded. */
  nextPeriodFocus: string | null;
  generatedAt: string;
}

export function InsightOfTheDay() {
  const { timezone } = useUserTimezone();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<Insight | null>('/api/insights/latest?period=WEEKLY');
      return { data: data ?? null, error: null as string | null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Could not load your insight',
      };
    }
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    void load().then((result) => {
      setInsight(result.data);
      setError(result.error);
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    /*
      State is written inside the promise callback, never synchronously in the
      effect body, and guarded by `cancelled` so a slow response arriving after
      unmount cannot update a component that is gone.
    */
    void load().then((result) => {
      if (cancelled) return;
      setInsight(result.data);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [load]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setNotice(null);
    try {
      const endDate = getTodayString(timezone);
      const result = await apiRequest<Insight>('/api/insights/generate', {
        method: 'POST',
        body: JSON.stringify({
          period: 'WEEKLY',
          startDate: shiftCalendarDay(endDate, -7),
          endDate,
        }),
      });
      setInsight(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not generate an insight';
      setNotice(
        message.includes('not configured')
          ? 'AI insights are not configured on this deployment. Everything else works without them.'
          : message
      );
    } finally {
      setGenerating(false);
    }
  }, [timezone]);

  const shell = 'glass-panel rounded-[20px] p-5';
  const hue = DOMAIN_ACCENT.insights.hue;

  if (loading) {
    return (
      <div className={shell} aria-busy="true" aria-label="Loading today's insight">        <div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={shell} style={{ ['--glass-hue' as string]: hue, ['--glass-tint' as string]: '8%' }}>
        <h2 className="text-sm font-semibold text-foreground">Insight of the day</h2>
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Empty / off. An invitation, not a void.
  if (!insight) {
    return (
      <div className={shell} style={{ ['--glass-hue' as string]: hue, ['--glass-tint' as string]: '8%' }}>
        <h2 className="text-sm font-semibold text-foreground">Insight of the day</h2>
        <div className="mt-3 flex flex-col items-start gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{ background: accentTint(hue, 12), color: hue }}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-xs text-muted-foreground">
            Turn on AI insights to get a daily nudge like this — one sentence and
            one thing to try.
          </p>
          {notice && (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
              {notice}
            </p>
          )}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
              'bg-primary text-primary-foreground transition active:scale-[0.97]',
              'motion-reduce:transition-none'
            )}
          >
            {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {generating ? 'Thinking...' : 'Generate'}
          </button>
        </div>
      </div>
    );
  }

  const lead = firstSentence(insight.summary);
  const action = firstSentence(insight.nextPeriodFocus ?? '');
  const wins = splitLines(insight.wins);
  const suggestions = splitLines(insight.suggestions);

  return (
    <div
      className={shell}
      // B6: a slightly stronger tint, and it stays cyan. This card is synthesised
      // content, and the duotone treatment on Weekly Recap is the same signal -
      // a reader can tell "composed about your data" from "measured from your
      // data" without reading either.
      style={{ ['--glass-hue' as string]: hue, ['--glass-tint' as string]: '8%' }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4" style={{ color: hue }} aria-hidden="true" />
          Insight of the day
        </h2>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating}
          aria-label="Regenerate insight"
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* One sentence. The rest is behind the disclosure. */}
      <p className="mt-2.5 text-sm leading-relaxed text-foreground">{lead}</p>

      {/* The one suggested action. */}
      {action && (
        <div
          className="mt-3 flex items-start gap-2 rounded-[14px] p-3"
          style={{ background: accentTint(hue, 8) }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: hue }}>
            Try
          </span>
          <p className="text-xs leading-relaxed text-foreground">{action}</p>
        </div>
      )}

      {notice && (
        <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {notice}
        </p>
      )}

      {(wins.length > 0 || suggestions.length > 0) && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {expanded ? 'Less' : 'See the full week'}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform motion-reduce:transition-none',
                expanded && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>

          {expanded && (
            <div className="mt-2 space-y-3 border-t border-border/70 pt-3">
              {wins.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Wins</h3>
                  <ul className="mt-1 space-y-0.5">
                    {wins.map((w, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        · {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {suggestions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Suggestions</h3>
                  <ul className="mt-1 space-y-0.5">
                    {suggestions.map((s, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        · {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground/70">
        Generated {new Date(insight.generatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}

function splitLines(value: string | null): string[] {
  return (value ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/** First sentence, so the card really is one line of thought. */
function firstSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(.+?[.!?])(\s|$)/);
  return (match?.[1] ?? trimmed).trim();
}
