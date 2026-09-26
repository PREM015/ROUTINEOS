'use client';

import { BookOpenCheck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { RecapExtras } from '@/types/recap';

interface LinkedReviewCardProps {
  linkedReview: NonNullable<RecapExtras['linkedReview']>;
}

function section(title: string, content: string | null): string | null {
  return content && content.trim().length > 0 ? `${title}: ${content.trim()}` : null;
}

/**
 * The weekly review / monthly reset written for this exact period, if one
 * exists. Source: WeeklyReview or MonthlyReset rows matched to the recap range.
 */
export default function LinkedReviewCard({ linkedReview }: LinkedReviewCardProps) {
  const review = linkedReview;
  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
          <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">
          {review.kind === 'weekly' ? 'Your weekly review' : 'Your monthly reset'}
        </h2>
      </header>

      <p className="text-xs tabular-nums text-muted-foreground">
        {review.kind === 'weekly'
          ? `Week of ${format(parseISO(review.period), 'MMM d, yyyy')}`
          : format(parseISO(`${review.period}-15`), 'MMMM yyyy')}
      </p>

      {review.overallSatisfaction != null && (
        <p className="mt-2 text-sm text-foreground">
          Overall satisfaction:{' '}
          <span className="font-semibold">{review.overallSatisfaction}/5</span>
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {[
          section('Wins', review.biggestWins),
          section('Challenges', review.challenges),
          section('Lessons', review.lessonsLearned),
          section('Next focus', review.nextFocus),
        ]
          .filter((item): item is string => Boolean(item))
          .map((item) => (
            <li
              key={item}
              className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm text-muted-foreground"
            >
              {item}
            </li>
          ))}
      </ul>
    </section>
  );
}