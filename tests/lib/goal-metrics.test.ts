import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildConsistency,
  buildSparkline,
  computeGoalPace,
  daysBetween,
  dueLabel,
  formatPercent,
  formatValuePair,
  netProgressByDay,
  observedVelocityPerDay,
  paceBandFor,
  paceLabel,
  paceSummary,
  PACE_BAND,
  type GoalLike,
  type ProgressPoint,
} from '@/lib/goals/goal-metrics';

/**
 * The pace calculation behind every visual on `/goals`.
 *
 * The invariant this file exists to protect:
 *
 * > Pace is one subtraction — progress share minus elapsed share. Nothing else.
 *
 * So the tests are organised around the ways that subtraction can go wrong:
 * an off-by-one in the calendar, a goal that has not started, a goal with no
 * target, an undo that leaves a phantom completion, and a "no data" that must
 * not be rendered as a zero.
 */

const TODAY = '2026-10-01';

function goal(overrides: Partial<GoalLike> = {}): GoalLike {
  return {
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    currentValue: 0,
    targetValue: 100,
    status: 'ACTIVE',
    ...overrides,
  };
}

/**
 * A 100-day window starting on the page's `TODAY`, 25% done.
 *
 * Chosen so "quarter of the way through, a quarter of the way done" is literally
 * true on {@link QUARTER_DAY}: `daysBetween('2026-10-01', '2027-01-09')` is 100,
 * so 25 days in is `elapsedShare = 0.25` and `progressShare = 0.25` is exactly
 * on pace. Every other share test can be read off this one window.
 */
function quarter(): GoalLike {
  return {
    startDate: TODAY,
    endDate: '2027-01-09',
    currentValue: 25,
    targetValue: 100,
    status: 'ACTIVE',
  };
}

/** 25 days into {@link quarter}'s window. */
const QUARTER_DAY = '2026-10-26';

function log(date: string, value: number, note?: string): ProgressPoint {
  return { date, value, note };
}

describe('daysBetween / addDays', () => {
  it('counts calendar labels, not instants', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0);
  });

  it('crosses a month and a year boundary', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('survives a leap day', () => {
    // 2028 is a leap year: Feb 28 -> Mar 1 is two days.
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('steps forwards and backwards, and can land on the same label', () => {
    expect(addDays('2026-10-01', 0)).toBe('2026-10-01');
    expect(addDays('2026-10-01', 30)).toBe('2026-10-31');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('steps over a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('returns the input unchanged when the label is unparseable', () => {
    expect(addDays('not-a-date', 5)).toBe('not-a-date');
    expect(daysBetween('nope', '2026-10-01')).toBe(0);
  });
});

describe('paceBandFor', () => {
  it('bands a signed gap at ±5 points, with the edge on-pace', () => {
    expect(PACE_BAND).toBe(0.05);
    expect(paceBandFor(0.051)).toBe('ahead');
    expect(paceBandFor(0.05)).toBe('on_pace');
    expect(paceBandFor(0)).toBe('on_pace');
    expect(paceBandFor(-0.05)).toBe('on_pace');
    expect(paceBandFor(-0.051)).toBe('behind');
  });

  it('gives every band a distinct text label, so colour is never alone', () => {
    const labels = (['ahead', 'on_pace', 'behind', 'overdue', 'done', 'inactive'] as const).map(
      paceLabel
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('computeGoalPace — shares', () => {
  it('reads the first day of a window as zero elapsed', () => {
    // 1 of 31 done on day one of a 30-day window: elapsed share is exactly 0, so
    // the goal reads as ~3 points ahead. This is why "on pace" is a ±5pt band and
    // not an equality test — a goal started today is never exactly even.
    const pace = computeGoalPace(
      goal({ startDate: '2026-10-01', endDate: '2026-10-31', currentValue: 1, targetValue: 31 }),
      TODAY
    );
    expect(pace.elapsedShare).toBe(0);
    expect(pace.progressShare).toBeCloseTo(1 / 31, 6);
    expect(pace.state).toBe('on_pace');
  });

  it('reads on pace when progress share equals elapsed share', () => {
    const pace = computeGoalPace(quarter(), QUARTER_DAY);
    expect(pace.elapsedShare).toBeCloseTo(0.25, 6);
    expect(pace.progressShare).toBeCloseTo(0.25, 6);
    expect(pace.state).toBe('on_pace');
    expect(pace.gapPoints).toBeCloseTo(0, 6);
  });

  it('reads behind when the calendar outruns progress', () => {
    // 55 of 100 days elapsed, still 25% done.
    const pace = computeGoalPace(quarter(), '2026-11-25');
    expect(pace.elapsedShare).toBeCloseTo(0.55, 6);
    expect(pace.state).toBe('behind');
    expect(pace.gapPoints).toBeLessThan(-PACE_BAND);
  });

  it('reads ahead with the same progress earlier in the window', () => {
    const pace = computeGoalPace(quarter(), '2026-10-16');
    expect(pace.elapsedShare).toBeCloseTo(0.15, 6);
    expect(pace.state).toBe('ahead');
    expect(pace.gapPoints).toBeGreaterThan(PACE_BAND);
  });

  it('reads ahead on day one with a quarter of the target already done', () => {
    const pace = computeGoalPace(quarter(), TODAY);
    expect(pace.elapsedShare).toBe(0);
    expect(pace.state).toBe('ahead');
  });

  it('clamps elapsed share to 1 once the window has closed', () => {
    const pace = computeGoalPace(quarter(), '2027-06-01');
    expect(pace.elapsedShare).toBe(1);
    expect(pace.daysElapsed).toBe(pace.daysTotal);
  });

  it('clamps elapsed share to 0 before the window opens', () => {
    const pace = computeGoalPace(
      goal({ startDate: '2026-11-01', endDate: '2026-12-01', currentValue: 0 }),
      TODAY
    );
    expect(pace.elapsedShare).toBe(0);
    expect(pace.isNotStarted).toBe(true);
    expect(pace.startsInDays).toBe(31);
  });

  it('never divides by zero for a same-day window', () => {
    const pace = computeGoalPace(
      goal({ startDate: TODAY, endDate: TODAY, currentValue: 5, targetValue: 10 }),
      TODAY
    );
    expect(pace.daysTotal).toBe(1);
    expect(Number.isFinite(pace.elapsedShare)).toBe(true);
    expect(pace.elapsedShare).toBe(0);
  });

  it('never divides by zero for an inverted window', () => {
    const pace = computeGoalPace(
      goal({ startDate: '2026-10-31', endDate: '2026-10-01', currentValue: 0 }),
      TODAY
    );
    expect(pace.daysTotal).toBe(1);
    expect(Number.isFinite(pace.progressShare)).toBe(true);
  });

  it('clamps progress share at 1 for an overshoot', () => {
    const pace = computeGoalPace(goal({ currentValue: 250, targetValue: 100 }), TODAY);
    expect(pace.progressShare).toBe(1);
    expect(pace.state).toBe('done');
    expect(formatPercent(pace.progressShare)).toBe('100%');
  });

  it('tolerates a negative current value rather than rendering a negative bar', () => {
    const pace = computeGoalPace(goal({ currentValue: -20, targetValue: 100 }), TODAY);
    expect(pace.progressShare).toBe(0);
    expect(Number.isFinite(pace.gapPoints)).toBe(true);
  });
});

describe('computeGoalPace — no target set', () => {
  it('reports hasNoTarget instead of a fake 0%', () => {
    const pace = computeGoalPace(goal({ targetValue: 0 }), TODAY);
    expect(pace.hasNoTarget).toBe(true);
    expect(pace.progressShare).toBe(0);
    expect(pace.projectedFinish).toBeNull();
    expect(paceSummary(pace)).toBe('No target set');
    expect(dueLabel(goal({ targetValue: 0 }), pace, TODAY)).toBe('NO TARGET');
  });

  it('is still paced by the calendar, so it reads as behind', () => {
    expect(computeGoalPace(quarter(), '2026-11-25').state).toBe('behind');
    const noTarget = computeGoalPace({ ...quarter(), targetValue: 0 }, '2026-11-25');
    expect(noTarget.hasNoTarget).toBe(true);
    expect(noTarget.state).toBe('behind');
  });

  it('treats a non-finite target as no target', () => {
    const pace = computeGoalPace(
      { ...goal(), targetValue: Number.NaN },
      TODAY
    );
    expect(pace.hasNoTarget).toBe(true);
  });
});

describe('computeGoalPace — states', () => {
  it('is overdue once the window closes without reaching the target', () => {
    const pace = computeGoalPace(goal({ currentValue: 10, targetValue: 100 }), '2026-11-15');
    expect(pace.state).toBe('overdue');
    expect(pace.isOverdue).toBe(true);
    expect(pace.daysRemaining).toBe(0);
  });

  it('prefers done over overdue when the target is reached late', () => {
    const pace = computeGoalPace(goal({ currentValue: 100, targetValue: 100 }), '2026-11-15');
    expect(pace.state).toBe('done');
    expect(pace.isOverdue).toBe(false);
  });

  it('is done on the COMPLETED status alone, with no progress', () => {
    // A goal completed by cancelling a target (target raised after completion)
    // must not be reported as behind.
    const pace = computeGoalPace(goal({ status: 'COMPLETED' }), TODAY);
    expect(pace.state).toBe('done');
  });

  it('is inactive for ON_HOLD, CANCELLED and CARRIED_OVER, and never overdue', () => {
for (const status of ['ON_HOLD', 'CANCELLED']) {
      const pace = computeGoalPace(goal({ status, currentValue: 0 }), '2027-01-01');
      expect(pace.state).toBe('inactive');
      expect(pace.isOverdue).toBe(false);
      expect(paceSummary(pace)).toBe('Paused — the clock is not running');
    }
  });

  it('paces CARRIED_OVER like a live goal, because its clock is running', () => {
    /*
     * The cross-page contradiction this pins.

     * `CARRIED_OVER` used to be inactive here while `lib/dashboard/derive.ts`
     * counted it as ACTIVE, so the same goal read "3 of 4 on pace" on /dashboard
     * and "Paused" on /goals at the same moment.

     * Carrying a goal over means it missed its end date and was given a NEW one.
     * The clock is running harder on it than on anything else — calling that
     * parked is what stops the app ever telling the user they are behind on
     * something they actually missed.
     */
    const pace = computeGoalPace(
      goal({ status: 'CARRIED_OVER', currentValue: 0 }),
      '2027-01-01'
    );
    expect(pace.state).not.toBe('inactive');
    expect(['ahead', 'on_pace', 'behind', 'overdue']).toContain(pace.state);
  });

  it('agrees with the dashboard on which statuses are active', () => {
    // The two lists, asserted side by side so they cannot drift again.
    const dashboardActive = ['ACTIVE', 'CARRIED_OVER'];
    for (const status of dashboardActive) {
      const pace = computeGoalPace(goal({ status, currentValue: 0 }), '2027-01-01');
      expect(pace.state).not.toBe('inactive');
    }
  });

  it('is done, not inactive, for COMPLETED even when overdue on paper', () => {
    const pace = computeGoalPace(goal({ status: 'COMPLETED' }), '2027-01-01');
    expect(pace.state).toBe('done');
    expect(pace.isOverdue).toBe(false);
  });

  it('says an unstarted goal has not started, rather than reporting it behind', () => {
    const pace = computeGoalPace(
      goal({ startDate: '2026-11-01', endDate: '2026-12-31', currentValue: 0 }),
      TODAY
    );
    expect(pace.state).toBe('on_pace');
    expect(paceSummary(pace)).toBe('Starts in 31 days');
  });
});

describe('scheduleSlackDays', () => {
  it('is zero when progress share matches elapsed share', () => {
    expect(computeGoalPace(quarter(), QUARTER_DAY).scheduleSlackDays).toBe(0);
    expect(paceSummary(computeGoalPace(quarter(), QUARTER_DAY))).toBe('On pace');
  });

  it('converts the share gap into days inside the goal\'s own remaining window', () => {
    // 30-day window, 10% done on day one: a 10-point lead, which scales to 3
    // days over the 30 it has left. The window length is what turns points into
    // days — a share on its own can never say "3 days ahead".
    const pace = computeGoalPace(
      goal({ startDate: '2026-10-01', endDate: '2026-10-31', currentValue: 10, targetValue: 100 }),
      TODAY
    );
    expect(pace.state).toBe('ahead');
    expect(pace.scheduleSlackDays).toBe(3);
    expect(paceSummary(pace)).toBe('3 days ahead');
  });

  it('reports behind in the past tense of the same unit', () => {
    // 30-day window, 10% done on day eleven: a third of the time gone, a tenth
    // of the work, 20 days left.
    const pace = computeGoalPace(
      goal({ startDate: '2026-10-01', endDate: '2026-10-31', currentValue: 10, targetValue: 100 }),
      '2026-10-11'
    );
    expect(pace.state).toBe('behind');
    expect(pace.scheduleSlackDays).toBe(-5);
    expect(paceSummary(pace)).toBe('5 days behind');
  });

  it('uses the singular for a one-day gap', () => {
    // 10-day window, 10% done on day one -> exactly one day of slack.
    const pace = computeGoalPace(
      goal({ startDate: '2026-10-01', endDate: '2026-10-11', currentValue: 10, targetValue: 100 }),
      TODAY
    );
    expect(pace.scheduleSlackDays).toBe(1);
    expect(paceSummary(pace)).toBe('1 day ahead');
  });

  it('is zero once the window has closed, because there is no future to save', () => {
    const pace = computeGoalPace(
      goal({ startDate: '2026-10-01', endDate: '2026-10-11', currentValue: 10, targetValue: 100 }),
      '2026-12-01'
    );
    expect(pace.daysRemaining).toBe(0);
    expect(pace.scheduleSlackDays).toBe(0);
    expect(pace.state).toBe('overdue');
  });
});

describe('netProgressByDay', () => {
  it('nets several rows on one day into a single value', () => {
    // `GoalProgress` has no `@@unique([goalId, date])`, so check-in then undo
    // check-in leaves two rows on the same day.
    const net = netProgressByDay([log('2026-10-01', 1), log('2026-10-01', 0)]);
    expect(net).toEqual([{ date: '2026-10-01', value: 1 }]);
  });

  it('cancels a done to a zero when undone', () => {
    const net = netProgressByDay([log('2026-10-01', 1), log('2026-10-01', -1)]);
    expect(net).toEqual([{ date: '2026-10-01', value: 0 }]);
  });

  it('sums deltas logged on different days', () => {
    const net = netProgressByDay([log('2026-10-02', 5), log('2026-10-01', 3)]);
    expect(net).toEqual([
      { date: '2026-10-01', value: 3 },
      { date: '2026-10-02', value: 5 },
    ]);
  });

  it('drops non-finite values instead of poisoning the total with NaN', () => {
    const net = netProgressByDay([log('2026-10-01', Number.NaN), log('2026-10-02', 5)]);
    expect(net).toEqual([{ date: '2026-10-02', value: 5 }]);
  });
});

describe('observedVelocityPerDay', () => {
  it('is null with no logs — no signal is not zero', () => {
    expect(observedVelocityPerDay(goal(), [], TODAY)).toBeNull();
  });

  it('is null with a single logged day, since there is no movement to divide', () => {
    expect(observedVelocityPerDay(goal(), [log('2026-10-01', 5)], TODAY)).toBeNull();
  });

  it('divides movement by the span it actually happened over', () => {
    // 10 units from 2026-09-28 to 2026-10-01 is a 3-day span, so 10/3.
    const velocity = observedVelocityPerDay(
      goal(),
      [log('2026-09-28', 5), log('2026-10-01', 5)],
      TODAY
    );
    expect(velocity).toBeCloseTo(10 / 3, 6);
  });

  it('is null when the window shows movement of zero', () => {
    expect(observedVelocityPerDay(goal(), [log('2026-09-30', 0), log('2026-10-01', 0)], TODAY)).toBeNull();
  });

  it('is not slowed by days it was silent inside the window', () => {
    // 10 units logged on the 28th and the 1st with nothing between. The rate is
    // movement over the span it happened in (3 days), not movement divided by
    // the whole 14-day window — a goal silent on Sunday is not 1/7th as fast.
    const quiet = observedVelocityPerDay(goal(), [log('2026-09-28', 5), log('2026-10-01', 5)], TODAY);
    expect(quiet).toBeCloseTo(10 / 3, 6);
  });

  it('falls back to the lifetime rate when the window has no logs at all', () => {
    // Nothing in the last 14 days, but 40 units over 100 elapsed days.
    const velocity = observedVelocityPerDay(
      { ...goal(), currentValue: 40, startDate: '2026-06-23' },
      [log('2026-06-23', 10), log('2026-06-24', 10)],
      TODAY
    );
    expect(velocity).toBeCloseTo(0.4, 6);
  });

  it('nets a same-day correction before measuring', () => {
    // The 30th nets to zero (a `1` corrected by a `-1`), so only the 1st counts:
    // 1 unit over the 1-day span from the 30th to the 1st.
    const velocity = observedVelocityPerDay(
      goal(),
      [log('2026-09-30', 1), log('2026-09-30', -1), log('2026-10-01', 1)],
      TODAY
    );
    expect(velocity).toBe(1);
  });
});

describe('projected finish', () => {
  /**
   * A 30-day window, 25% done, 25 days in. Chosen because a projection can
   * *miss* this deadline: at 100-day windows almost any rate lands on time, so
   * "late by N days" would be untestable against {@link quarter}.
   */
  function nearDeadline(): GoalLike {
    return goal({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      currentValue: 25,
      targetValue: 100,
    });
  }

  /** 2026-10-26: 25 of the window's 30 days gone. */
  const NEAR_DAY = '2026-10-26';

  it('projects from the observed rate', () => {
    const pace = computeGoalPace(
      nearDeadline(),
      NEAR_DAY,
      [log('2026-10-22', 10), log('2026-10-26', 10)]
    );
    // 20 units in 4 days = 5/day; 75 left = 15 days -> 2026-11-10.
    expect(pace.projectedFinish).toBe('2026-11-10');
    expect(pace.projectedLateByDays).toBe(10);
  });

  it('is on time when the rate reaches the target inside the window', () => {
    const pace = computeGoalPace(
      nearDeadline(),
      NEAR_DAY,
      [log('2026-10-25', 15), log('2026-10-26', 15)]
    );
    // 30 units in 1 day = 30/day; 75 left = 3 days -> 2026-10-29, five to spare.
    expect(pace.projectedFinish).toBe('2026-10-29');
    expect(pace.projectedLateByDays).toBe(0);
  });

  it('projects today when there is nothing left to do', () => {
    const pace = computeGoalPace(
      { ...nearDeadline(), currentValue: 100 },
      NEAR_DAY,
      [log('2026-10-25', 15), log('2026-10-26', 15)]
    );
    expect(pace.projectedFinish).toBe(NEAR_DAY);
    expect(pace.state).toBe('done');
  });

  it('projects nothing when there is no measurable rate', () => {
    const pace = computeGoalPace(goal({ currentValue: 20 }), TODAY, []);
    expect(pace.projectedFinish).toBeNull();
    expect(pace.projectedLateByDays).toBe(0);
    expect(pace.velocityPerDay).toBeNull();
  });
});

describe('buildConsistency', () => {
  const daily = goal({ startDate: '2026-09-01', endDate: '2026-12-31', currentValue: 3, targetValue: 1 });

  it('never counts a day outside the goal window as missed', () => {
    // A goal whose window opens after the whole strip: every day is out of scope,
    // so there is no completion rate to report — `null`, never `0`.
    const summary = buildConsistency(
      goal({ startDate: '2026-12-01', endDate: '2027-01-31' }),
      [],
      TODAY,
      5
    );
    expect(summary.days[0]?.date).toBe('2026-09-27');
    expect(summary.days.every((d) => d.state === 'not_applicable')).toBe(true);
    expect(summary.completionRate).toBeNull();
    expect(summary.streak).toBe(0);
    expect(summary.missedDays).toBe(0);
  });

  it('marks an unfinished today as pending, never as a miss', () => {
    const summary = buildConsistency(
      goal({ startDate: '2026-09-25', endDate: '2026-12-31' }),
      [log('2026-09-30', 1)],
      TODAY,
      5
    );
    expect(summary.days.at(-1)?.state).toBe('pending');
    expect(summary.doneDays).toBe(1);
    expect(summary.missedDays).toBe(3);
  });

  it('marks an applicable, unlogged past day as missed', () => {
    const summary = buildConsistency(
      goal({ startDate: '2026-09-25', endDate: '2026-12-31' }),
      [],
      TODAY,
      5
    );
    expect(summary.days[0]?.state).toBe('missed');
    // 2026-09-27..30 missed; today still pending.
    expect(summary.missedDays).toBe(4);
  });

  it('counts a streak backwards including today when today is logged', () => {
    const summary = buildConsistency(
      daily,
      [log('2026-10-01', 1), log('2026-09-30', 1), log('2026-09-29', 1)],
      TODAY,
      30
    );
    expect(summary.streak).toBe(3);
    expect(summary.longestStreak).toBe(3);
  });

  it('keeps a streak alive across an unfinished today', () => {
    // The fact-about-the-clock case: at 09:00 the streak is not yet broken.
    const summary = buildConsistency(daily, [log('2026-09-30', 1), log('2026-09-29', 1)], TODAY, 30);
    expect(summary.days.at(-1)?.state).toBe('pending');
    expect(summary.streak).toBe(2);
  });

  it('breaks the streak on a missed day', () => {
    // Logged the 28th, silent on the 30th: the run stops at the gap, so today
    // being still open does not rescue it.
    const summary = buildConsistency(daily, [log('2026-09-28', 1)], TODAY, 30);
    expect(summary.streak).toBe(0);
  });

  it('holds a one-day streak when only yesterday was logged', () => {
    // Today pending + yesterday done is a live streak of 1, not 0.
    const summary = buildConsistency(daily, [log('2026-09-30', 1)], TODAY, 30);
    expect(summary.streak).toBe(1);
  });

  it('nets a corrected day back to not-done', () => {
    // A `1` later corrected by a `-1` on the same day is not a completion.
    const summary = buildConsistency(daily, [log('2026-09-30', 1), log('2026-09-30', -1)], TODAY, 30);
    expect(summary.doneDays).toBe(0);
    expect(summary.days.at(-3)?.state).toBe('missed');
  });

  it('counts a single positive row as done', () => {
    const summary = buildConsistency(daily, [log('2026-09-30', 1)], TODAY, 30);
    expect(summary.doneDays).toBe(1);
  });

  it('reports null, not zero, when the goal applied on no days', () => {
    const summary = buildConsistency(
      goal({ startDate: '2027-01-01', endDate: '2027-12-31' }),
      [],
      TODAY,
      5
    );
    expect(summary.applicableDays).toBe(0);
    expect(summary.completionRate).toBeNull();
  });

  it('excludes not-applicable days from the completion rate', () => {
    const summary = buildConsistency(
      goal({ startDate: '2026-09-29', endDate: '2026-10-01' }),
      [log('2026-09-29', 1), log('2026-09-30', 1)],
      TODAY,
      5
    );
    expect(summary.applicableDays).toBe(3);
    expect(summary.doneDays).toBe(2);
    expect(summary.completionRate).toBeCloseTo(2 / 3, 6);
  });

  it('finds a longest streak that is not the current one', () => {
    const summary = buildConsistency(
      daily,
      [
        log('2026-09-20', 1),
        log('2026-09-21', 1),
        log('2026-09-22', 1),
        log('2026-09-23', 1),
        log('2026-09-28', 1),
        log('2026-09-29', 1),
        log('2026-09-30', 1),
        log('2026-10-01', 1),
      ],
      TODAY,
      30
    );
    expect(summary.longestStreak).toBe(4);
    expect(summary.streak).toBe(4);
  });
});

describe('buildSparkline', () => {
  it('returns exactly one point per day, oldest first', () => {
    const spark = buildSparkline([], quarter(), QUARTER_DAY, 30);
    expect(spark).toHaveLength(30);
    expect(spark[0]?.date).toBe('2026-09-27');
    expect(spark.at(-1)?.date).toBe(QUARTER_DAY);
  });

  it('carries progress forward so a silent day does not reset the line', () => {
    // 10-day strip ending 2026-10-26, so 2026-10-17..2026-10-26. Logged 10 on
    // the 21st and 10 on the 26th.
    const spark = buildSparkline(
      [log('2026-10-21', 10), log('2026-10-26', 10)],
      quarter(),
      QUARTER_DAY,
      10
    );
    expect(spark[0]?.date).toBe('2026-10-17');
    expect(spark[0]?.value).toBeNull();
    expect(spark.at(-6)?.value).toBeCloseTo(0.1, 6); // the 21st
    expect(spark.at(-3)?.value).toBeCloseTo(0.1, 6); // the 24th, held flat
    expect(spark.at(-1)?.value).toBeCloseTo(0.2, 6); // the 26th
  });

  it('normalises against the target, not the raw value', () => {
    const spark = buildSparkline([log(QUARTER_DAY, 50)], { ...quarter(), targetValue: 200 }, QUARTER_DAY, 3);
    expect(spark.at(-1)?.value).toBeCloseTo(0.25, 6);
  });

  it('reports zero rather than null for a goal with no target', () => {
    const spark = buildSparkline([log(QUARTER_DAY, 5)], { ...quarter(), targetValue: 0 }, QUARTER_DAY, 3);
    expect(spark.at(-1)?.value).toBe(0);
  });

  it('ignores logs dated in the future', () => {
    const spark = buildSparkline([log('2026-12-25', 50)], quarter(), QUARTER_DAY, 3);
    expect(spark.at(-1)?.value).toBeNull();
  });

  it('nets a corrected day back to no progress', () => {
    const spark = buildSparkline(
      [log(QUARTER_DAY, 1), log(QUARTER_DAY, -1)],
      { ...quarter(), targetValue: 30 },
      QUARTER_DAY,
      3
    );
    expect(spark.at(-1)?.value).toBe(0);
  });

  it('leaves a day before any log as null rather than zero', () => {
    const spark = buildSparkline([log(QUARTER_DAY, 10)], quarter(), QUARTER_DAY, 5);
    expect(spark[0]?.value).toBeNull();
  });
});

describe('dueLabel', () => {
  it('counts forward to the deadline', () => {
    const g = goal({ endDate: '2026-10-13' });
    const pace = computeGoalPace(g, TODAY);
    expect(dueLabel(g, pace, TODAY)).toBe('DUE IN 12 DAYS');
  });

  it('uses the singular for tomorrow', () => {
    const g = goal({ endDate: '2026-10-02' });
    expect(dueLabel(g, computeGoalPace(g, TODAY), TODAY)).toBe('DUE IN 1 DAY');
  });

  it('says DUE TODAY on the day', () => {
    const g = goal({ endDate: TODAY });
    expect(dueLabel(g, computeGoalPace(g, TODAY), TODAY)).toBe('DUE TODAY');
  });

  it('counts backward once the deadline has passed', () => {
    const g = goal({ endDate: '2026-09-27' });
    expect(dueLabel(g, computeGoalPace(g, TODAY), TODAY)).toBe('4 DAYS OVERDUE');
  });

  it('uses the singular for one day overdue', () => {
    const g = goal({ endDate: '2026-09-30' });
    expect(dueLabel(g, computeGoalPace(g, TODAY), TODAY)).toBe('1 DAY OVERDUE');
  });

  it('reports the terminal states instead of a countdown', () => {
    const g = goal({ endDate: '2026-10-13' });
    expect(dueLabel(g, computeGoalPace({ ...g, status: 'COMPLETED' }, TODAY), TODAY)).toBe('COMPLETED');
    expect(dueLabel(g, computeGoalPace({ ...g, status: 'ON_HOLD' }, TODAY), TODAY)).toBe('PAUSED');
  });
});

describe('formatValuePair / formatPercent', () => {
  it('pairs current and target with the unit once', () => {
    expect(formatValuePair(42, 100, 'km')).toBe('42 / 100 km');
    expect(formatValuePair(42, 100, null)).toBe('42 / 100');
    expect(formatValuePair(42, 100, '')).toBe('42 / 100');
  });

  it('trims float noise but keeps real decimals', () => {
    expect(formatValuePair(12.000000000000002, 100)).toBe('12 / 100');
    expect(formatValuePair(4.5, 10)).toBe('4.5 / 10');
  });

  it('clamps the percentage at 100', () => {
    expect(formatPercent(1.18)).toBe('100%');
    expect(formatPercent(0.735)).toBe('74%');
    expect(formatPercent(-0.2)).toBe('0%');
  });
});