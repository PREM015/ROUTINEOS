'use client';

/**
 * The achievements page's three non-happy states, kept together because they are
 * three answers to one question - "why am I not looking at twenty tiles?" - and
 * they used to be conflated.
 *
 * ## What went wrong before
 *
 * The page gated its spinner on `!rows && !error`. On a failed request both were
 * set, so the spinner branch was skipped and the page fell through to the fully
 * rendered body with `rows === null`: level 1, 0 XP, twenty locked badges, and a
 * history section reading "No unlocks yet". A failed request rendered as a
 * complete and entirely false gallery. The filter bar's own empty state - "No
 * achievements match / Try clearing the filters" - compounded it by blaming the
 * user's filters for a network error.
 *
 * So the states are separated by cause, and only one of them is the filter's
 * fault:
 *
 * | State | Cause | What it offers |
 * | ----- | ----- | -------------- |
 * | skeleton | in flight | the shape of what is coming |
 * | error | the request failed | Retry |
 * | first run | genuinely nothing earned | what to do about it |
 * | empty | filters exclude everything | clear the filters |
 *
 * The first three live here. The fourth belongs to `AchievementList`, which is
 * the only component that knows a filter is active.
 */

import Link from 'next/link';
import { AlertTriangle, Compass, RefreshCw, Sparkles } from 'lucide-react';
import { ACHIEVEMENT_XP } from '@/lib/achievements/xp';
import { RARITY_ORDER } from '@/lib/achievements/view-model';
import { ACHIEVEMENT_RARITIES } from '@/lib/constants/achievements';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/**
 * A skeleton shaped like the real page.
 *
 * A centred spinner says "something is happening somewhere"; a skeleton says
 * "a hero, three next-up cards and a four-column grid are arriving", so the page
 * does not jump when it lands. Tile count is deliberately short - a full twenty
 * placeholders is more work than the content and reads as a wall.
 */
export function AchievementPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your achievements…</span>

      <Skeleton className="h-9 w-56" shine />
      <Skeleton className="h-4 w-72" />

      {/* Hero: ring on the left, bar and rarity chips on the right. */}
      <div className="ach-panel rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex flex-wrap gap-2 pt-1">
              {RARITY_ORDER.map((rarity) => (
                <Skeleton key={rarity} className="h-6 w-24 rounded-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * The request failed. Distinct from every empty state, and it says so.
 *
 * `role="alert"` so it is announced; the wording names the cause rather than
 * apologising, because "something went wrong" gives the user nothing to act on.
 */
export function AchievementErrorState({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">
        We couldn&apos;t load your achievements
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={cn(
          'mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          'disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none'
        )}
      >
        <RefreshCw
          className={cn('h-4 w-4', retrying && 'animate-spin motion-reduce:animate-none')}
          aria-hidden="true"
        />
        {retrying ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  );
}

/**
 * Nothing earned yet.
 *
 * Twenty locked tiles with no explanation is a wall, so this says how XP works,
 * what the rarest badges are worth, and links to the three places an unlock can
 * actually come from. A first-run state that only says "no achievements yet"
 * teaches nothing and gives nowhere to go.
 */
export function AchievementFirstRun({ total }: { total: number }) {
  return (
    <div className="ach-band-gold rounded-3xl border border-dashed border-[var(--ach-hairline-strong)] px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--accent-gold)_16%,transparent)] text-[var(--accent-gold)]">
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Your first badge is close</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        There are {total} to work toward. Each one you unlock adds XP, and XP raises your trophy
        level - rarer badges are worth more, up to {ACHIEVEMENT_XP.LEGENDARY} XP for a Legendary.
      </p>

      <div className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-1.5">
        {RARITY_ORDER.map((rarity) => (
          <span
            key={rarity}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{ color: ACHIEVEMENT_RARITIES[rarity].color }}
          >
            {ACHIEVEMENT_RARITIES[rarity].icon} {ACHIEVEMENT_XP[rarity]} XP
          </span>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {[
          { href: '/today', label: 'Log a habit' },
          { href: '/goals', label: 'Complete a goal' },
          { href: '/focus', label: 'Start a focus session' },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
          >
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}