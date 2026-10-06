'use client';

import { useMemo } from 'react';
import { CheckCircle2, Compass, ListTodo, Sparkles } from 'lucide-react';
import type { AnalyticsDashboard } from '@/types/analytics';

/**
 * A guided read-through of the period, built only from what is already loaded.
 *
 * ## Why this is not a tour
 *
 * A tour points at features. This answers four questions in order — how did it go, what
 * worked, what needs attention, what to do next — and every screen is composed from the
 * payload the page already has. Nothing is fetched, so opening it costs nothing and it
 * cannot fail in a way the main view would notice.
 *
 * ## Why it hides itself
 *
 * When there is not enough data to fill two screens honestly, it does not render at all.
 * A review mode that opens onto "not enough data yet" four times over is worse than no
 * review mode, and it would train the user to dismiss it.
 *
 * ## No duplicated judgement
 *
 * The "what worked" and "what needs attention" screens read the server's `insights` array
 * rather than re-deciding which habits did well. Re-deriving that here would be a second
 * set of thresholds, and the two would disagree — which is the failure this whole feature
 * set has been dismantling since Phase 0.
 */

export interface ReviewScreen {
  id: 'overview' | 'wins' | 'attention' | 'next';
  title: string;
  icon: typeof Compass;
  body: string;
  /** Optional onward step. */
  href?: string;
  hrefLabel?: string;
}

export function buildReviewScreens(payload: AnalyticsDashboard): ReviewScreen[] {
  const screens: ReviewScreen[] = [];

  const scoreLine =
    payload.hero.total != null
      ? `Average score ${Math.round(payload.hero.total)} out of 100` +
        (payload.hero.grade ? `, grade ${payload.hero.grade}` : '') +
        `, over ${payload.hero.daysScored} scored ${payload.hero.daysScored === 1 ? 'day' : 'days'}.`
      : 'No score was recorded in this period.';

  const comparisonLine =
    payload.comparison.delta != null
      ? `That is ${payload.comparison.delta > 0 ? 'up' : 'down'} ${Math.abs(payload.comparison.delta)} points. ${payload.comparison.basis}`
      : payload.comparison.basis;

  screens.push({
    id: 'overview',
    title: 'Overview',
    icon: Compass,
    body: `${scoreLine} ${comparisonLine}`,
  });

  const wins = payload.insights.filter(
    (insight) => insight.severity === 'positive'
  );
  if (wins.length > 0) {
    screens.push({
      id: 'wins',
      title: 'What worked',
      icon: CheckCircle2,
      body: wins.map((insight) => `${insight.headline}. ${insight.evidence}`).join(' '),
    });
  }

  const attention = payload.insights.filter(
    (insight) => insight.severity === 'negative'
  );
  if (attention.length > 0) {
    screens.push({
      id: 'attention',
      title: 'Needs a look',
      icon: ListTodo,
      body: attention
        .map((insight) => `${insight.headline}. ${insight.evidence}`)
        .join(' '),
    });
  }

  /*
    The onward step is chosen from what the period actually contains rather than from a
    fixed order, so a user with no habits is not told to go and review their habits.
  */
  const next =
    attention.find((insight) => insight.href) ??
    wins.find((insight) => insight.href) ??
    null;

  screens.push({
    id: 'next',
    title: 'Next step',
    icon: Sparkles,
    body: next
      ? `${next.headline}. ${next.evidence}`
      : 'Nothing here needs chasing. Keep logging and the next period will have more to say.',
    href: next?.href ?? undefined,
    hrefLabel: next?.hrefLabel ?? undefined,
  });

  return screens;
}

/**
 * Whether a review is worth offering.
 *
 * Requires a score and at least one insight, which is the point at which there is
 * something to read rather than a restatement of "no data".
 */
export function canReview(payload: AnalyticsDashboard): boolean {
  return payload.hero.total != null && payload.insights.length > 0;
}

export function useReviewScreens(payload: AnalyticsDashboard): ReviewScreen[] | null {
  return useMemo(() => (canReview(payload) ? buildReviewScreens(payload) : null), [payload]);
}
