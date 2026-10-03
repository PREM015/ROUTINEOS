'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { useCountUp } from '@/components/motion/useCountUp';
import { SCORE_GRADES, type ScoreGrade } from '@/types/score';
import { cn } from '@/lib/utils';

/**
 * The daily score, as `/today` presents it.
 *
 * ## Why this is not the concentric rings any more
 *
 * The rings showed Core / Growth / Bonus as three unlabelled arcs, and the
 * same three values were then repeated below as `Core: 0  Growth: 0  Bonus: 0`
 * in a legend row. Reading the card meant decoding which arc was which and then
 * cross-referencing the legend â€” and with all three at `0` the arcs were
 * indistinguishable from a loading state.
 *
 * A bar per bucket, each with its label and value on the same line, is the same
 * information with no decoding step. The rings were dropped, not the data.
 *
 * ## Copy
 *
 * `SCORE_GRADES.F.description` is `"Try again tomorrow"`, which is advice for a
 * graded report. On a page that re-renders every minute of the current day it
 * reads as though the day were already over, so a `0` gets a context line
 * instead: what to log to move the number. The shared `SCORE_GRADES` table is
 * left alone â€” other pages render its descriptions verbatim and they are right
 * there.
 */

export interface DailyScoreView {
  totalScore: number | null;
  overallGrade: ScoreGrade | null;
  coreScore: number | null;
  growthScore: number | null;
  bonusScore: number | null;
  habitCompletionRate: number | null;
  routineCompletionRate: number | null;
  sleepScore: number | null;
}

/**
 * Grade â†’ pill classes.
 *
 * A lookup rather than a chain of `&&` guards: the condition is a single
 * value, and four independent conditionals re-evaluated the same lookup four
 * times to pick one class.
 */
const GRADE_TONE: Record<ScoreGrade, string> = {
  'A+': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  A: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  B: 'bg-primary/15 text-primary',
  C: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  D: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  F: 'bg-destructive/15 text-destructive',
};

interface Bucket {
  key: 'coreScore' | 'growthScore' | 'bonusScore';
  label: string;
  /** What the bucket actually contains, so the number is explainable. */
  hint: string;
  bar: string;
  text: string;
}

const BUCKETS: Bucket[] = [
  {
    key: 'coreScore',
    label: 'Core',
    hint: 'Non-negotiable + growth habits',
    bar: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-300',
  },
  {
    key: 'growthScore',
    label: 'Growth',
    hint: 'Lifestyle + flexible habits',
    bar: 'bg-violet-500',
    text: 'text-violet-700 dark:text-violet-300',
  },
  {
    key: 'bonusScore',
    label: 'Bonus',
    hint: 'Everything optional',
    bar: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
  },
];

export function DailyScoreBreakdown({ data }: { data: DailyScoreView }) {
  const reduce = useReducedMotion();
  const total = data.totalScore ?? 0;
  const grade = data.overallGrade;
  const gradeInfo = grade ? SCORE_GRADES[grade] : SCORE_GRADES.F;
  const counted = useCountUp(total, 1);

  const rates = [
    { label: 'Habits', value: data.habitCompletionRate, unit: '%' },
    { label: 'Routine', value: data.routineCompletionRate, unit: '%' },
    { label: 'Sleep', value: data.sleepScore, unit: '/100' },
  ].filter((r) => r.value !== null) as Array<{ label: string; value: number; unit: string }>;

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* ---------- the score itself ---------- */}
      <div className="flex items-end justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold leading-none tabular-nums text-foreground sm:text-5xl">
              {Math.round(counted)}
            </span>
            <span className="text-sm font-medium text-muted-foreground">/ 100</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {total > 0
              ? gradeInfo.description
              : 'Nothing logged yet today â€” a habit, a routine block, or some sleep will move this.'}
          </p>
        </div>
        <span
          className={cn(
            'mb-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
            GRADE_TONE[grade ?? 'F']
          )}
        >
          {gradeInfo.label}
        </span>
      </div>

      {/* ---------- the three buckets, each on its own row ---------- */}
      <dl className="space-y-3">
        {BUCKETS.map((bucket, index) => {
          const value = data[bucket.key] ?? 0;
          const pct = Math.max(0, Math.min(100, value));
          return (
            <div key={bucket.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <dt className={cn('text-sm font-semibold', bucket.text)}>{bucket.label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-foreground">
                  {Math.round(value)}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">/100</span>
                </dd>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${bucket.label} score`}
              >
                <motion.div
                  className={cn('h-full rounded-full', bucket.bar)}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : index * 0.07 }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{bucket.hint}</p>
            </div>
          );
        })}
      </dl>

      {/* ---------- completion rates ---------- */}
      {rates.length > 0 ? (
        <dl className="grid grid-cols-3 gap-2">
          {rates.map((rate) => (
            <div key={rate.label} className="rounded-lg bg-muted/50 px-2.5 py-2">
              <dt className="text-[11px] text-muted-foreground">{rate.label}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                {Math.round(rate.value)}
                <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
                  {rate.unit}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">
          No component scores yet â€” log a habit, a routine block or some sleep.
        </p>
      )}
    </div>
  );
}