'use client';

import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Flame, Minus, TrendingUp } from 'lucide-react';
import type { AnalyticsHighlight } from '@/types/analytics';

/**
 * The period's findings, as chips.
 *
 * ## Why this renders nothing when it has nothing to say
 *
 * The server applies a documented minimum to every rule and sends an empty array when
 * none qualify. An empty array must produce *no row*, not a placeholder — a permanent
 * "no insights yet" card on a page that has data is the exact failure the previous
 * always-on empty AI state had, and it reads as a broken feature rather than a quiet
 * one.
 *
 * ## Why the evidence is always visible
 *
 * A chip that says "Meditate is up 30 points" invites either belief or dismissal. One
 * that also says "86% of 7 due, against 60% of 5 in September" can be checked, and a
 * claim the user can check is one they will act on. That is why `evidence` is rendered
 * inline rather than behind a hover or a disclosure: hiding it would make the chip
 * decoration.
 *
 * ## Why severity never relies on colour alone
 *
 * Every chip pairs its colour with an arrow or a dash and states the direction in the
 * sentence. Roughly one man in twelve cannot reliably separate the red and green, and
 * "up 30 points" in red next to "up 12 points" in green is exactly the case where that
 * matters — both say "up".
 */
export function HighlightChips({
  insights,
  onMute,
}: {
  insights: AnalyticsHighlight[];
  onMute?: (category: AnalyticsHighlight['category']) => void;
}) {
  if (insights.length === 0) return null;

  return (
    <section aria-labelledby="analytics-highlights" className="mt-6">
      <h2 id="analytics-highlights" className="sr-only">
        What changed in this period
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight) => (
          <li key={insight.id}>
            <article
              className={`h-full rounded-xl border p-4 transition-colors ${TONE[insight.severity]}`}
            >
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-0.5 shrink-0">
                  {ICONS[insight.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <SeverityMark severity={insight.severity} />
                    {insight.headline}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {insight.evidence}
                  </p>
                  {/*
                    The basis is in the DOM but not shouted. It exists so a user who
                    does not believe the chip can see the rule that produced it —
                    `title` plus `sr-only` text, rather than a permanent line of
                    small print under every chip.
                  */}
                  <p className="mt-1 text-[11px] text-muted-foreground/80">{insight.basis}</p>
                  <div className="mt-2 flex items-center gap-3">
                    {insight.href && (
                      <Link
                        href={insight.href}
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        {insight.hrefLabel ?? 'Open'}
                      </Link>
                    )}
                    {onMute && (
                      <button
                        type="button"
                        onClick={() => onMute(insight.category)}
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        Hide these
                        <span className="sr-only">: {insight.headline}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Direction mark.
 *
 * Separate from the category icon so the two are not fighting: the icon says what kind
 * of finding this is, the mark says which way it points.
 */
function SeverityMark({ severity }: { severity: AnalyticsHighlight['severity'] }) {
  if (severity === 'negative') {
    return <ArrowDownRight className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />;
  }
  if (severity === 'positive') {
    return <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />;
  }
  return <Minus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

const TONE: Record<AnalyticsHighlight['severity'], string> = {
  positive: 'border-emerald-500/25 bg-emerald-500/5',
  negative: 'border-destructive/25 bg-destructive/5',
  neutral: 'border-border/60 bg-card/50',
};

const ICONS: Record<AnalyticsHighlight['category'], React.ReactNode> = {
  mover: <TrendingUp className="h-4 w-4 text-primary" />,
  day: <Flame className="h-4 w-4 text-amber-500" />,
  streak: <Flame className="h-4 w-4 text-rose-500" />,
  slipping: <ArrowDownRight className="h-4 w-4 text-destructive" />,
};
