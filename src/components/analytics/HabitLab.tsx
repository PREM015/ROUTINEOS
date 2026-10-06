'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { AnalyticsHabitPanel } from '@/types/analytics';
import type { HabitTier } from '@/constants/prisma-enums';
import { cn } from '@/lib/utils';
import {
  DEFAULT_HABIT_FILTERS,
  HABIT_TIER_DISPLAY_ORDER,
  filterAndSortHabits,
  summariseHabits,
  toHabitRows,
  type HabitFilters,
  type HabitSort,
} from '@/lib/analytics/habit-lab';
import { percentText } from '@/lib/analytics/format';

/**
 * Where the habit rate is actually won or lost.
 *
 * ## Why the headline rate is not recomputed here
 *
 * The pooled rate at the top is read from `panel.rate` — the same field the hero shows —
 * and never recounted from the rows on screen. That is the whole point of this card.
 *
 * A list that filters, then averages what is left, reports a different number from the
 * hero for the same period. Search for one habit and the card would cheerfully claim a
 * 100% habit rate next to the hero's 62%. That is the four-denominators defect this whole
 * feature set exists to end, reappearing through the back door of a filter box.
 *
 * So: the pooled figures are fixed by the server, and the controls below only decide which
 * rows are visible.
 */
export function HabitLab({
  panel,
  periodLabel,
}: {
  panel: AnalyticsHabitPanel;
  periodLabel: string;
}) {
  const [filters, setFilters] = useState<HabitFilters>(DEFAULT_HABIT_FILTERS);

  const rows = useMemo(() => toHabitRows(panel.perHabit), [panel.perHabit]);
  const visible = useMemo(() => filterAndSortHabits(rows, filters), [rows, filters]);
  const summary = useMemo(() => summariseHabits(visible), [visible]);

  const toggleTier = (tier: HabitTier) => {
    setFilters((current) => ({
      ...current,
      tiers: current.tiers.includes(tier)
        ? current.tiers.filter((t) => t !== tier)
        : [...current.tiers, tier],
    }));
  };

  if (rows.length === 0) {
    return (
      <section className="glass-panel rounded-2xl p-6 shadow-soft">
        <h2 className="text-sm font-semibold text-foreground">Habit breakdown</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No habits yet. Create one and it will appear here with its own rate.
        </p>
        <Link
          href="/habits"
          className="mt-3 inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Go to habits
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="habit-lab" className="glass-panel rounded-2xl p-6 shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="habit-lab" className="text-sm font-semibold text-foreground">
          Habit breakdown
        </h2>
        {/*
          Read, never derived. Same source as the hero's "Habit reliability" tile, so the
          two cannot disagree.
        */}
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {percentText(panel.rate)}
          </span>{' '}
          overall in {periodLabel}
        </p>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search habits</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
            placeholder="Search habits"
            className="w-full rounded-lg border border-border/60 bg-background/60 py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select
            value={filters.sort}
            onChange={(event) =>
              setFilters((current) => ({ ...current, sort: event.target.value as HabitSort }))
            }
            className="rounded-lg border border-border/60 bg-background/60 px-2 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="rate-asc">Lowest rate</option>
            <option value="rate-desc">Highest rate</option>
            <option value="completed-desc">Most completions</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      {/* Tier filters. Only tiers actually present, so the row is never a dead control. */}
      {presentTiers(rows.map((row) => row.tier)).length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {presentTiers(rows.map((row) => row.tier)).map((tier) => {
            const active = filters.tiers.includes(tier);
            return (
              <button
                key={tier}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTier(tier)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {tierLabel(tier)}
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{summary}</p>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No habits match those filters.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/40">
          {visible.map((habit) => (
            <HabitRow key={habit.habitId} habit={habit} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One habit.
 *
 * A `<Link>` wrapping the whole row rather than a link on the name: the row *is* the
 * target, and a keyboard user should be able to reach it from anywhere in the row. The
 * accessible name therefore has to carry the numbers too, because the visual rate bar is
 * `aria-hidden` and a bare "Meditate" link tells the user nothing about what they would
 * be looking at.
 */
function HabitRow({ habit }: { habit: ReturnType<typeof toHabitRows>[number] }) {
  const rate = habit.rate;

  return (
    <li>
      <Link
        href={`/habits/${habit.habitId}`}
        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{habit.name}</span>
            <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {tierLabel(habit.tier)}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.max(0, Math.min(100, rate ?? 0))}%` }}
            />
          </span>
        </span>

        <span className="shrink-0 text-right">
          {/*
            A dash, not 0%, when the habit was never due. `notDue` habits are also sorted
            last and muted, so the three treatments agree — a habit that did not apply is
            absent from the story rather than at the bottom of it as a failure.
          */}
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              habit.notDue ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {habit.notDue ? '—' : percentText(rate)}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {habit.notDue ? 'Not due' : `${habit.completed} of ${habit.scheduled}`}
          </span>
        </span>

        <span className="sr-only">
          {habit.notDue
            ? `${habit.name}, not due in this period`
            : `${habit.name}, ${Math.round(rate ?? 0)} percent, ${habit.completed} of ${habit.scheduled} completed`}
        </span>
      </Link>
    </li>
  );
}

/** Tiers actually present, in display order, so the chip row has no dead entries. */
function presentTiers(tiers: HabitTier[]): HabitTier[] {
  const seen = new Set(tiers);
  return HABIT_TIER_DISPLAY_ORDER.filter((tier) => seen.has(tier));
}

/** `CORE` reads better as `Core` on a chip. */
function tierLabel(tier: HabitTier): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}
