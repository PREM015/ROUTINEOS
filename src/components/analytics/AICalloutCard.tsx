'use client';

import { BadgeCheck, Moon, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { AnalyticsInsight } from '@/types/analytics';

interface AICalloutCardProps {
  insight: AnalyticsInsight | null;
  onDismiss?: (id: string) => void;
}

/**
 * AI insight callout rendered from a real insight row (period-scoped, generated
 * by the AI pipeline). Dismissing calls DELETE /api/analytics/insights/[id] so
 * the same insight never resurfaces without being regenerated.
 * @remark Source: AIInsight row.
 */
export default function AICalloutCard({ insight, onDismiss }: AICalloutCardProps) {
  const [dismissing, setDismissing] = useState(false);

  if (!insight) {
    return (
      <section className="glass-panel rounded-2xl border border-primary/20 p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">AI insight</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Insights generated from your routines, focus and sleep will appear here.
        </p>
      </section>
    );
  }

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const res = await fetch(`/api/analytics/insights/${insight.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDismiss?.(insight.id);
      }
    } catch {
      // Non-fatal — the callout stays put on failure.
    } finally {
      setDismissing(false);
    }
  };

  return (
    <section className="glass-panel glow-primary relative rounded-2xl border border-primary/20 p-6 shadow-soft">
      <button
        type="button"
        onClick={() => void handleDismiss()}
        disabled={dismissing}
        aria-label="Dismiss insight"
        className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">AI insight</h2>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground/90">{insight.summary}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Moon className="h-3.5 w-3.5" aria-hidden="true" />
          {insight.period}
        </span>
        {insight.wasHelpful === true && (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Marked helpful
          </span>
        )}
        <span className="tabular-nums">{new Date(insight.generatedAt).toLocaleDateString()}</span>
      </div>
    </section>
  );
}