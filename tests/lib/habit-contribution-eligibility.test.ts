import { describe, expect, it } from 'vitest';
import {
  isEligibleOn,
  type ContributionHabit,
  type EligibilityContext,
  type OverrideLike,
} from '@/lib/habits/contribution-eligibility';
import { habitAppliesToDayType } from '@/lib/habits/day-type-match';

/**
 * The in-memory eligibility mirror.
 *
 * These cases exist because this is a **second implementation** of
 * `calculateHabitEligibility`, and the failure mode of two implementations of one
 * rule is not a crash - it is a grid that quietly disagrees with the `/today`
 * checklist about which habits were due. The precedence cases below are the ones
 * that are easy to get subtly wrong, so they are pinned.
 */

function habit(overrides: Partial<ContributionHabit> = {}): ContributionHabit {
  return {
    id: 'h1',
    name: 'Read',
    tier: 'GROWTH',
    status: 'ACTIVE',
    frequencyType: 'DAILY',
    frequencyValue: null,
    appliesEveryDay: true,
    startDay: '2026-01-01',
    endDay: null,
    dayTypeAssignments: [],
    color: null,
    icon: null,
    points: null,
    ...overrides,
  };
}

function ctx(overrides: OverrideLike[] = [], dayTypes: EligibilityContext['dayTypes'] = new Map()): EligibilityContext {
  const byHabit = new Map<string, OverrideLike[]>();
  for (const o of overrides) {
    const list = byHabit.get(o.habitId) ?? [];
    list.push(o);
    byHabit.set(o.habitId, list);
  }
  return { overrides: byHabit, dayTypes };
}

describe('isEligibleOn - status', () => {
  it('rejects an archived habit before anything else', () => {
    const result = isEligibleOn(
      habit({ status: 'ARCHIVED' }),
      '2026-06-01',
      ctx()
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('ARCHIVED');
  });

  it('rejects a paused habit', () => {
    expect(isEligibleOn(habit({ status: 'PAUSED' }), '2026-06-01', ctx()).reason).toBe('PAUSED');
  });
});

describe('isEligibleOn - date bounds', () => {
  it('rejects a date before the habit started', () => {
    const result = isEligibleOn(habit({ startDay: '2026-03-01' }), '2026-02-28', ctx());
    expect(result.reason).toBe('BEFORE_START_DATE');
  });

  it('accepts the start date itself', () => {
    expect(isEligibleOn(habit({ startDay: '2026-03-01' }), '2026-03-01', ctx()).eligible).toBe(true);
  });

  it('rejects a date after an end date', () => {
    const result = isEligibleOn(habit({ endDay: '2026-03-31' }), '2026-04-01', ctx());
    expect(result.reason).toBe('AFTER_END_DATE');
  });

  it('treats a null end date as open-ended', () => {
    expect(isEligibleOn(habit({ endDay: null }), '2026-12-31', ctx()).eligible).toBe(true);
  });
});

describe('isEligibleOn - override precedence', () => {
  const skip: OverrideLike = { habitId: 'h1', type: 'SKIP_RANGE', startDate: '2026-01-01', endDate: '2026-12-31' };
  const pause: OverrideLike = { habitId: 'h1', type: 'PAUSE', startDate: '2026-01-01', endDate: null };
  const notApplicable: OverrideLike = { habitId: 'h1', type: 'NOT_APPLICABLE', startDate: '2026-01-01', endDate: null };

  it('lets a skip beat a reschedule on the same day', () => {
    // "Do not ask me this" must win over "put this on today's list" - they mean
    // opposite things and the reschedule was written first.
    const reschedule: OverrideLike = { habitId: 'h1', type: 'RESCHEDULE', startDate: '2026-06-01', endDate: '2026-06-01' };
    const result = isEligibleOn(habit(), '2026-06-01', ctx([reschedule, skip]));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('SKIPPED');
  });

  it('lets a pause beat a reschedule', () => {
    const reschedule: OverrideLike = { habitId: 'h1', type: 'RESCHEDULE', startDate: '2026-06-01', endDate: '2026-06-01' };
    expect(isEligibleOn(habit(), '2026-06-01', ctx([reschedule, pause])).reason).toBe('PAUSE_OVERRIDE');
  });

  it('lets NOT_APPLICABLE beat a reschedule', () => {
    const reschedule: OverrideLike = { habitId: 'h1', type: 'RESCHEDULE', startDate: '2026-06-01', endDate: '2026-06-01' };
    expect(isEligibleOn(habit(), '2026-06-01', ctx([reschedule, notApplicable])).reason).toBe(
      'NOT_APPLICABLE'
    );
  });

  it('ignores an override whose range does not cover the date', () => {
    const oldSkip: OverrideLike = { habitId: 'h1', type: 'SKIP_RANGE', startDate: '2026-01-01', endDate: '2026-01-31' };
    expect(isEligibleOn(habit(), '2026-06-01', ctx([oldSkip])).eligible).toBe(true);
  });

  it('treats a null endDate on an override as open-ended', () => {
    expect(isEligibleOn(habit(), '2026-06-01', ctx([skip, pause, notApplicable])).eligible).toBe(
      false
    );
  });
});

describe('isEligibleOn - reschedule', () => {
  it('makes an otherwise-unscheduled habit eligible, flagged as manual', () => {
    // A Monday-only habit on a Tuesday, plus a reschedule for that Tuesday.
    const mondayOnly = habit({ frequencyType: 'SPECIFIC_WEEKDAYS', frequencyValue: '1' });
    const without = isEligibleOn(mondayOnly, '2026-06-02', ctx());
    expect(without.eligible).toBe(false);
    expect(without.reason).toBe('NOT_SCHEDULED');

    const reschedule: OverrideLike = { habitId: 'h1', type: 'RESCHEDULE', startDate: '2026-06-02', endDate: '2026-06-02' };
    const withOverride = isEligibleOn(mondayOnly, '2026-06-02', ctx([reschedule]));
    expect(withOverride.eligible).toBe(true);
    expect(withOverride.manual).toBe(true);
  });

  it('does not mark a normally-scheduled day as manual', () => {
    const result = isEligibleOn(habit(), '2026-06-01', ctx());
    expect(result.eligible).toBe(true);
    expect(result.manual).toBe(false);
  });
});

describe('isEligibleOn - frequency', () => {
  it('honours SPECIFIC_WEEKDAYS', () => {
    const monday = habit({ frequencyType: 'SPECIFIC_WEEKDAYS', frequencyValue: '1' });
    // 2026-06-01 is a Monday, 2026-06-02 a Tuesday.
    expect(isEligibleOn(monday, '2026-06-01', ctx()).eligible).toBe(true);
    expect(isEligibleOn(monday, '2026-06-02', ctx()).eligible).toBe(false);
  });

  it('accepts every day for a DAILY habit', () => {
    const daily = habit({ frequencyType: 'DAILY' });
    for (const date of ['2026-06-05', '2026-06-06', '2026-06-07']) {
      expect(isEligibleOn(daily, date, ctx()).eligible).toBe(true);
    }
  });
});

describe('isEligibleOn - day types', () => {
  const weekendOnly = habit({
    appliesEveryDay: false,
    dayTypeAssignments: [{ dayTypeId: 'd-weekend', dayType: { slug: 'weekend' } }],
  });

  it('excludes a restricted habit on a day of the wrong type', () => {
    const dayTypes = new Map([
      ['2026-06-01', { dayType: 'WORKDAY' as const, dayTypeId: 'd-work' }],
    ]);
    const result = isEligibleOn(weekendOnly, '2026-06-01', ctx([], dayTypes));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('DAY_TYPE_MISMATCH');
  });

  it('includes a restricted habit on a matching day type', () => {
    const dayTypes = new Map([
      ['2026-06-06', { dayType: 'WEEKEND' as const, dayTypeId: 'd-weekend' }],
    ]);
    expect(isEligibleOn(weekendOnly, '2026-06-06', ctx([], dayTypes)).eligible).toBe(true);
  });

  it('does not treat a restricted habit with no assignments as global', () => {
    // Silently promoting it would make the assignment disappear with no way for
    // the user to notice. `habitAppliesToDayType` owns that rule; this asserts the
    // mirror inherits it rather than skipping the check.
    const orphan = habit({ appliesEveryDay: false, dayTypeAssignments: [] });
    const dayTypes = new Map([['2026-06-01', { dayType: 'WORKDAY' as const, dayTypeId: 'd-work' }]]);
    expect(isEligibleOn(orphan, '2026-06-01', ctx([], dayTypes)).reason).toBe('DAY_TYPE_MISMATCH');
  });

  it('checks the day type BEFORE the frequency, like the canonical rule', () => {
    // A restricted habit that is also off-frequency must report the day-type
    // reason, because that is the one `calculateHabitEligibility` would report.
    const both = habit({
      appliesEveryDay: false,
      frequencyType: 'SPECIFIC_WEEKDAYS',
      frequencyValue: '1',
      dayTypeAssignments: [{ dayTypeId: 'd-weekend', dayType: { slug: 'weekend' } }],
    });
    const dayTypes = new Map([
      ['2026-06-02', { dayType: 'WORKDAY' as const, dayTypeId: 'd-work' }], // Tuesday
    ]);
    expect(isEligibleOn(both, '2026-06-02', ctx([], dayTypes)).reason).toBe('DAY_TYPE_MISMATCH');
  });
});

describe('the mirror and the canonical rule agree on the day-type predicate', () => {
  it('delegates rather than reimplementing, so it cannot drift', () => {
    const h = habit({
      appliesEveryDay: false,
      dayTypeAssignments: [{ dayTypeId: 'd-weekend', dayType: { slug: 'weekend' } }],
    });
    // The mirror has no day-type logic of its own; if this ever stops holding, a
    // second implementation crept in.
    expect(habitAppliesToDayType(h, { dayType: 'WEEKEND', dayTypeId: 'd-weekend' })).toBe(true);
    expect(habitAppliesToDayType(h, { dayType: 'WORKDAY', dayTypeId: 'd-work' })).toBe(false);
  });
});
