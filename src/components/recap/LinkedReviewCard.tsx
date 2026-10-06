'use client';

import Link from 'next/link';
import { ArrowRight, BookOpenCheck, Pencil } from 'lucide-react';
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
 *
 * Previously this rendered the review's contents and stopped. It is a *recap* of
 * a reflection, so the only useful thing to do with it is go and write the
 * reflection — and the page that owns those fields is one hop away and was not
 * linked. Every path that produced this card now ends in a dead end.
 */
export default function LinkedReviewCard({ linkedReview }: LinkedReviewCardProps) {
  const review = linkedReview;
  const isWeekly = review.kind === 'weekly';
  const href = isWeekly ? '/recap/weekly-review' : '/recap/monthly-reset';

  const sections = [
    section('Wins', review.biggestWins),
    section('Challenges', review.challenges),
    section('Lessons', review.lessonsLearned),
    section('Next focus', review.nextFocus),
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
          <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">
          {isWeekly ? 'Your weekly review' : 'Your monthly reset'}
        </h2>
      </header>

      <p className="text-xs tabular-nums text-muted-foreground">
        {isWeekly
          ? `Week of ${format(parseISO(review.period), 'MMM d, yyyy')}`
          : format(parseISO(`${review.period}-15`), 'MMMM yyyy')}
      </p>

      {review.overallSatisfaction != null && (
        <p className="mt-2 text-sm text-foreground">
          Overall satisfaction:{' '}
          <span className="font-semibold">{review.overallSatisfaction}/5</span>
        </p>
      )}

      {sections.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {sections.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm text-muted-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {isWeekly
            ? 'This week has a review saved, but none of its sections were filled in.'
            : 'This month has a reset saved, but none of its sections were filled in.'}
        </p>
      )}

      <Link
        href={href}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        {isWeekly ? 'Edit your weekly review' : 'Edit your monthly reset'}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}