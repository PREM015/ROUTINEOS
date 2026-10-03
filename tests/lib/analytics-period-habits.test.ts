import { describe, expect, it } from 'vitest';
import type { DayType, HabitTier } from '@/generated/prisma';
import {
  buildPeriodHabits,
  emptyPeriodHabits,
  type PeriodHabitModel,
} from '@/lib/analytics/period-habits';
import {
  toContributionHabit,
  type ContributionHabit,
  type EligibilityContext,
} from '@/lib/habits/contribution-eligibility';
import { buildEligibilityContext } from '@/server/analytics/eligibility-context';

/**
 * The one definition of "habit completion" for day / week / month / year.
 *
 * These tests exist because the number used to mean four different things across
 * the four tabs (see §26 of `page md/analytics.md`), and because `null` vs `0` is
 * the difference between "nothing was due" and "you did nothing".
 *
 * No database: `buildPeriodHabits` is pure, and `buildEligibilityContext` fills
 * the eligibility context from plain arrays.
 *
 * The window throughout is **Mon 2024-03-04 → Sun 2024-03-10**, seven days, so
 * weekday-dependent expectations are readable directly off the dates.
 */

const CORE = 'CORE' as HabitTier;
const GROWTH = 'GROWTH' as HabitTier;

/** A habit eligible every day from `startDay`, with no overrides. */
function habit(id: string, overrides: Partial<ContributionHabit> = {}): ContributionHabit {
  return {
    id,
    name: `habit-${id}`,
    tier: CORE,
    status: 'ACTIVE',
    frequencyType: 'DAILY',
    frequencyValue: null,
    appliesEveryDay: true,
    startDay: '2020-01-01',
    endDay: null,
    color: null,
    icon: null,
    points: null,
    streakCount: 0,
    dayTypeAssignments: [],
    ...overrides,
  };
}

/** Mondays only — eligible on exactly one day of the standard window. */
const mondaysOnly = {
  frequencyType: 'SPECIFIC_WEEKDAYS' as const,
  frequencyValue: '1',
};

/** No overrides and no day-type restrictions, so only the arithmetic is under test. */
function plainContext(): EligibilityContext {
  return buildEligibilityContext([], [], [], { from: '2020-01-01', to: '2030-12-31' });
}

function contextWith(
  overrides: Array<{ habitId: string; type: string; startDate: string; endDate: string | null }>
): EligibilityContext {
  return buildEligibilityContext(overrides, [], [], { from: '2020-01-01', to: '2030-12-31' });
}

function model(
  habits: ContributionHabit[],
  logs: Array<{ habitId: string; date: string; status: string }>,
  ctx = plainContext()
): PeriodHabitModel {
  return buildPeriodHabits({
    start: '2024-03-04',
    end: '2024-03-10',
    habits,
    logs,
    ctx,
  });
}

function row(m: PeriodHabitModel, habitId: string) {
  const found = m.perHabit.find((h) => h.habitId === habitId);
  if (!found) throw new Error(`no row for ${habitId}`);
  return found;
}

const completed = (...dates: string[]) =>
  dates.map((date) => ({ habitId: 'a', date, status: 'COMPLETED' }));

describe('buildPeriodHabits — the denominator', () => {
  it('is completed / scheduled, where scheduled is the days the habit was eligible', () => {
    const m = model(
      [habit('a')],
      completed('2024-03-04', '2024-03-05', '2024-03-06', '2024-03-07', '2024-03-08')
    );

    expect(m.totals.scheduled).toBe(7);
    expect(m.totals.completed).toBe(5);
    expect(m.totals.rate).toBe(71.43);
  });

  it('is `null` — not 0 — when nothing was ever due', () => {
    // A habit that has not started yet. "No data" and "you did nothing" are
    // different claims, and the tile has to be able to make the first one.
    const m = model([habit('future', { startDay: '2024-03-20' })], []);

    expect(m.totals.scheduled).toBe(0);
    expect(m.totals.rate).toBeNull();
    expect(row(m, 'future').rate).toBeNull();
  });

  it('is 0 — not null — when something was due and nothing was done', () => {
    const m = model([habit('a')], []);

    expect(m.totals.scheduled).toBe(7);
    expect(m.totals.rate).toBe(0);
  });

  it('pools numerator and denominator rather than averaging per-habit rates', () => {
    /*
      The mean-of-rates version gave a once-a-week habit the same vote as a daily
      one, so a user's week was decided by whichever habit deviated more. Pooling
      is also the arithmetic `DailyScore.habitCompletionRate` uses, which is what
      makes the period tiles and the daily score agree by construction.
    */
    const dailyLogs = completed(
      '2024-03-04',
      '2024-03-05',
      '2024-03-06',
      '2024-03-07',
      '2024-03-08'
    );
    const rareLog = [{ habitId: 'rare', date: '2024-03-04', status: 'MISSED' }];

    const m = model([habit('a'), habit('rare', mondaysOnly)], [...dailyLogs, ...rareLog]);

    expect(row(m, 'a').scheduled).toBe(7);
    expect(row(m, 'rare').scheduled).toBe(1);
    expect(m.totals.scheduled).toBe(8);
    expect(m.totals.rate).toBe(62.5);

    // The mean-of-rates answer would have been (71.43 + 0) / 2 = 35.71.
    expect(m.totals.rate).not.toBe(35.71);
  });

  it('never counts a completion above 100%', () => {
    /*
      A retroactive tick can leave a COMPLETED row for a day the habit was not due
      on. Counting it would push the rate above 100%.
    */
    const m = model(
      [habit('rare', mondaysOnly)],
      [
        { habitId: 'rare', date: '2024-03-04', status: 'COMPLETED' },
        { habitId: 'rare', date: '2024-03-06', status: 'COMPLETED' },
      ]
    );

    expect(row(m, 'rare').scheduled).toBe(1);
    expect(row(m, 'rare').completed).toBe(1);
    expect(m.totals.rate).toBe(100);
  });

  it('only counts days inside the window it is given', () => {
    const m = model(
      [habit('a')],
      [
        { habitId: 'a', date: '2024-03-01', status: 'COMPLETED' },
        { habitId: 'a', date: '2024-03-05', status: 'COMPLETED' },
        { habitId: 'a', date: '2024-03-20', status: 'COMPLETED' },
      ]
    );

    expect(m.days).toHaveLength(7);
    expect(m.totals.completed).toBe(1);
  });
});

describe('buildPeriodHabits — habit lifecycle bounds', () => {
  it('does not count a habit that had not started yet', () => {
    const m = model([habit('late', { startDay: '2024-03-09' })], []);
    expect(row(m, 'late').scheduled).toBe(2);
  });

  it('does not count a habit that had already ended', () => {
    const m = model([habit('ended', { endDay: '2024-03-05' })], []);
    expect(row(m, 'ended').scheduled).toBe(2);
  });

  it('treats a currently-paused habit as never due', () => {
    /*
      Documented consequence of reusing `isEligibleOn`: it reads the habit's
      *current* status, so pausing a habit retroactively removes it from the
      window. Diverging here would be the fourth definition of "scheduled" that
      `lib/analytics/period-habits` exists to prevent — the contribution heatmap
      has the same behaviour.
    */
    const m = model([habit('paused', { status: 'PAUSED' })], []);
    expect(row(m, 'paused').scheduled).toBe(0);
    expect(row(m, 'paused').rate).toBeNull();
  });
});

describe('buildPeriodHabits — skips', () => {
  it('drops a SKIP_RANGE override window from `scheduled`', () => {
    /*
      `HabitService.skipHabit` writes **both** a `SKIP_TODAY`/`SKIP_RANGE`
      override **and** a `SKIPPED` log row. The override is the signal that says
      "do not ask me", and it is what removes the day from the denominator.
    */
    const ctx = contextWith([
      { habitId: 'a', type: 'SKIP_RANGE', startDate: '2024-03-06', endDate: '2024-03-08' },
    ]);
    const m = model([habit('a')], [], ctx);

    expect(row(m, 'a').scheduled).toBe(4);
    // Four days were still due and none were done — a real zero, not an absence.
    expect(row(m, 'a').rate).toBe(0);
  });

  it('still counts a bare SKIPPED log row as due — the override is the signal', () => {
    /*
      Without an override, a `SKIPPED` row is only a record that something was
      written. Treating it as an excuse to shrink the denominator would let a
      stray row erase a failure, which is the direction the whole change is
      meant to move away from.
    */
    const m = model([habit('a')], [{ habitId: 'a', date: '2024-03-04', status: 'SKIPPED' }]);

    expect(row(m, 'a').scheduled).toBe(7);
    expect(row(m, 'a').skipped).toBe(1);
    expect(row(m, 'a').rate).toBe(0);
  });

  it('does not let a reschedule override an explicit skip', () => {
    // Precedence itself is pinned by tests/lib/habit-contribution-eligibility.test.ts;
    // this only checks the period model inherits it rather than re-deriving it.
    const ctx = contextWith([
      { habitId: 'rare', type: 'RESCHEDULE', startDate: '2024-03-07', endDate: '2024-03-07' },
      { habitId: 'rare', type: 'SKIP_RANGE', startDate: '2024-03-07', endDate: '2024-03-07' },
    ]);
    const m = model([habit('rare', mondaysOnly)], [], ctx);

    const thursday = m.days.find((day) => day.date === '2024-03-07');
    expect(thursday?.scheduledHabitIds).not.toContain('rare');
    expect(row(m, 'rare').scheduled).toBe(1);
  });

  it('lets a reschedule add a day the frequency rule would have skipped', () => {
    const ctx = contextWith([
      { habitId: 'rare', type: 'RESCHEDULE', startDate: '2024-03-07', endDate: '2024-03-07' },
    ]);
    const m = model([habit('rare', mondaysOnly)], [], ctx);

    // Monday (03-04) by frequency, plus Thursday (03-07) by the override.
    expect(row(m, 'rare').scheduled).toBe(2);
  });
});

describe('buildPeriodHabits — per-day detail', () => {
  it('separates "no record" from "logged a miss"', () => {
    /*
      A day with no `HabitLog` row is unknown, not failed. The model has to be
      able to say so — that is the entire reason for a scheduled denominator
      instead of a logged-rows denominator.
    */
    const m = model(
      [habit('a')],
      [
        { habitId: 'a', date: '2024-03-04', status: 'COMPLETED' },
        { habitId: 'a', date: '2024-03-05', status: 'MISSED' },
      ]
    );

    expect(m.days[0]?.noRecord).toBe(0);
    expect(m.days[1]?.noRecord).toBe(0);
    // Wednesday onwards: due, nothing recorded.
    expect(m.days[2]?.noRecord).toBe(1);
    expect(m.scheduledDays).toBe(7);
    expect(m.noRecordDays).toBe(5);
  });

  it('reports fullDays only where everything due was done', () => {
    const m = model(
      [habit('a'), habit('b')],
      [
        { habitId: 'a', date: '2024-03-04', status: 'COMPLETED' },
        { habitId: 'b', date: '2024-03-04', status: 'COMPLETED' },
      ]
    );
    expect(m.fullDays).toBe(1);
  });

  it('exposes the raw log status so a day view can tell NOT_DUE from NOT_LOGGED', () => {
    const m = model([habit('a')], [{ habitId: 'a', date: '2024-03-04', status: 'MISSED' }]);

    expect(m.logStatuses.get('a|2024-03-04')).toBe('MISSED');
    expect(m.logStatuses.has('a|2024-03-05')).toBe(false);
  });
});

describe('buildPeriodHabits — tiers', () => {
  it('gives a tier with nothing due a null rate rather than 0', () => {
    const m = model(
      [habit('core', { tier: CORE }), habit('growth', { tier: GROWTH, startDay: '2024-03-20' })],
      [{ habitId: 'core', date: '2024-03-04', status: 'COMPLETED' }]
    );

    const core = m.byTier.find((tier) => tier.tier === CORE);
    const growth = m.byTier.find((tier) => tier.tier === GROWTH);

    expect(core?.rate).toBe(14.29);
    expect(growth?.rate).toBeNull();
    // Ranked first because it has a rate at all, not because it scored higher.
    expect(m.byTier[0]?.tier).toBe(CORE);
  });

  it('counts the active tier mix over ACTIVE habits only', () => {
    const m = model(
      [habit('a'), habit('b'), habit('p', { status: 'PAUSED' })],
      []
    );
    expect(m.activeTierMix).toEqual([{ tier: CORE, count: 2 }]);
  });
});

describe('buildEligibilityContext — the shared day-type map', () => {
  it("maps a natural day type onto the user's own DayTypeDefinition by slug", () => {
    /*
      Without this mapping a day-type-restricted habit is filtered by `dayTypeId`,
      the id is `null`, and the restriction silently stops applying — the bug
      documented on `habitAppliesToDayType`.
    */
    const ctx = buildEligibilityContext(
      [],
      [{ id: 'def-1', slug: 'work-day', name: 'Workday' }],
      [],
      { from: '2024-03-04', to: '2024-03-05' }
    );

    expect(ctx.dayTypes.get('2024-03-04')?.dayType).toBe('WORKDAY');
    expect(ctx.dayTypes.get('2024-03-04')?.dayTypeId).toBe('def-1');
  });

  it('lets an exception win over the natural rule for that date', () => {
    const ctx = buildEligibilityContext(
      [],
      [{ id: 'def-1', slug: 'work-day', name: 'Workday' }],
      [{ date: '2024-03-04', dayTypeId: null, dayType: 'WEEKEND' as DayType }],
      { from: '2024-03-04', to: '2024-03-05' }
    );

    expect(ctx.dayTypes.get('2024-03-04')?.dayType).toBe('WEEKEND');
    expect(ctx.dayTypes.get('2024-03-05')?.dayType).toBe('WORKDAY');
  });

  it('groups overrides by habit', () => {
    const ctx = contextWith([
      { habitId: 'a', type: 'SKIP_RANGE', startDate: '2024-03-05', endDate: '2024-03-06' },
    ]);

    expect(ctx.overrides.get('a')).toHaveLength(1);
    expect(ctx.overrides.has('b')).toBe(false);
  });
});

describe('emptyPeriodHabits', () => {
  it('is the honest shape for a period that has not happened', () => {
    const m = emptyPeriodHabits();

    expect(m.days).toEqual([]);
    expect(m.totals.rate).toBeNull();
    expect(m.scheduledDays).toBe(0);
    expect(m.activeTierMix).toEqual([]);
  });
});

describe('toContributionHabit', () => {
  it('carries streakCount through so a day view need not re-read the habit', () => {
    const converted = toContributionHabit({
      id: 'a',
      name: 'Read',
      tier: CORE,
      status: 'ACTIVE',
      frequencyType: 'DAILY',
      frequencyValue: null,
      appliesEveryDay: true,
      startDate: new Date('2024-01-01T00:00:00Z'),
      endDate: null,
      color: null,
      icon: null,
      points: 5,
      streakCount: 9,
      dayTypeAssignments: [],
    });

    expect(converted.streakCount).toBe(9);
  });
});
