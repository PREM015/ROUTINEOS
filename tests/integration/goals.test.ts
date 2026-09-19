import { describe, expect, it } from 'vitest';

import {
  canCarryOver,
  createCarryOverGoal,
  getSuggestedCarryOverDate,
} from '../../src/lib/goals/carry-over';
import {
  checkAllGoalsCompletion,
  checkGoalCompletion,
  markGoalComplete,
} from '../../src/lib/goals/completion';
import {
  getExpiredGoals,
  getDaysUntilDue,
  isGoalAtRisk,
  isGoalExpired,
} from '../../src/lib/goals/expiration';
import {
  calculateCompletionPercentage,
  getProgressStatus,
  getRemainingValue,
} from '../../src/lib/goals/progress';
import {
  calculateVelocity,
  getProjectedCompletionDate,
  isOnTrack,
} from '../../src/lib/goals/velocity';
import { makeGoal } from '../utils/db';

type GoalLike = Parameters<typeof calculateCompletionPercentage>[0];
type ProgressEntry = Parameters<typeof calculateVelocity>[1];

function goal(overrides: Record<string, unknown> = {}): GoalLike {
  return makeGoal(overrides) as GoalLike;
}

describe('goal progress helpers', () => {
  it('calculates completion percentage with clamping', () => {
    expect(calculateCompletionPercentage(goal({ targetValue: 0, currentValue: 5 }))).toBe(100);
    expect(
      calculateCompletionPercentage(goal({ targetValue: 10, currentValue: 5 }))
    ).toBe(50);
    expect(
      calculateCompletionPercentage(goal({ targetValue: 10, currentValue: 12 }))
    ).toBe(100);
    expect(
      calculateCompletionPercentage(goal({ targetValue: 10, currentValue: 0 }))
    ).toBe(0);
  });

  it('derives progress status from completion and due date', () => {
    expect(
      getProgressStatus(goal({ status: 'COMPLETED', endDate: '2099-12-31' }))
    ).toBe('completed');
    expect(
      getProgressStatus(goal({ status: 'ACTIVE', endDate: '2099-12-31', currentValue: 5 }))
    ).toBe('in-progress');
    expect(
      getProgressStatus(goal({ status: 'ACTIVE', endDate: '2099-12-31', currentValue: 0 }))
    ).toBe('not-started');
    expect(
      getProgressStatus(goal({ status: 'ACTIVE', endDate: '2000-01-01', currentValue: 5 }))
    ).toBe('overdue');
  });

  it('returns the remaining target value', () => {
    expect(getRemainingValue(goal({ targetValue: 10, currentValue: 3 }))).toBe(7);
    expect(getRemainingValue(goal({ targetValue: 10, currentValue: 12 }))).toBe(0);
    expect(getRemainingValue(goal({ targetValue: null, currentValue: 3 }))).toBeNull();
  });
});

describe('goal completion helpers', () => {
  it('checks completion against target, with status fallback when no target', () => {
    expect(checkGoalCompletion(goal({ targetValue: 10, currentValue: 10 }))).toBe(true);
    expect(checkGoalCompletion(goal({ targetValue: 10, currentValue: 9 }))).toBe(false);
    expect(
      checkGoalCompletion(goal({ targetValue: null, status: 'COMPLETED' }))
    ).toBe(true);
    expect(checkGoalCompletion(goal({ targetValue: null, status: 'ACTIVE' }))).toBe(false);
  });

  it('marks a goal complete and stamps the ISO timestamp', () => {
    const patch = markGoalComplete(goal());
    expect(patch.status).toBe('COMPLETED');
    expect(Number.isNaN(Date.parse(String(patch.completedAt)))).toBe(false);
  });

  it('upgrades only qualifying goals in a list', () => {
    const done = goal({ id: 'g1', targetValue: 5, currentValue: 5 });
    const pending = goal({ id: 'g2', targetValue: 5, currentValue: 2 });
    const upgraded = checkAllGoalsCompletion([pending, done]);
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]?.id).toBe('g1');
    expect(upgraded[0]?.status).toBe('COMPLETED');
  });
});

describe('goal velocity helpers', () => {
  const entries = (rows: Array<{ recordedAt: string; value: number }>): ProgressEntry =>
    rows as ProgressEntry;

  it('returns null without at least two progress points', () => {
    expect(calculateVelocity(goal(), [])).toBeNull();
    expect(calculateVelocity(goal(), entries([{ recordedAt: '2026-09-01T00:00:00.000Z', value: 4 }]))).toBeNull();
  });

  it('computes value gain per day between the outer points', () => {
    const velocity = calculateVelocity(
      goal(),
      entries([
        { recordedAt: '2026-09-01T00:00:00.000Z', value: 1 },
        { recordedAt: '2026-09-03T00:00:00.000Z', value: 5 },
      ])
    );
    expect(velocity).toBe(2);
  });

  it('returns null when all points share the same day', () => {
    const velocity = calculateVelocity(
      goal(),
      entries([
        { recordedAt: '2026-09-01T09:00:00.000Z', value: 1 },
        { recordedAt: '2026-09-01T18:00:00.000Z', value: 5 },
      ])
    );
    expect(velocity).toBeNull();
  });

  it('projects a completion date from remaining value', () => {
    expect(getProjectedCompletionDate(goal({ targetValue: 10, currentValue: 5 }), 0)).toBeNull();
    expect(getProjectedCompletionDate(goal({ targetValue: 10, currentValue: 5 }), -1)).toBeNull();
    const projected = getProjectedCompletionDate(goal({ targetValue: 10, currentValue: 5 }), 2);
    expect(projected).not.toBeNull();
    expect(Date.parse(String(projected))).toBeGreaterThan(Date.now());
  });

  it('reports on-track status against the goal end date', () => {
    expect(isOnTrack(goal({ targetValue: 10, currentValue: 5, endDate: '2099-12-31' }), 2)).toBe(
      true
    );
    expect(isOnTrack(goal({ targetValue: 10, currentValue: 5, endDate: '2026-10-01' }), 0.01)).toBe(
      false
    );
  });
});

describe('goal expiration and carry-over helpers', () => {
  const pastEnd = { endDate: '2000-01-01' };
  const futureEnd = { endDate: '2099-12-31' };

  it('expires active goals past their due date', () => {
    expect(isGoalExpired(goal(pastEnd), '2026-09-19')).toBe(true);
    expect(isGoalExpired(goal(futureEnd), '2026-09-19')).toBe(false);
    expect(isGoalExpired(goal({ ...pastEnd, status: 'COMPLETED' }), '2026-09-19')).toBe(false);
  });

  it('counts days until due, clamped to zero', () => {
    expect(getDaysUntilDue(goal({ endDate: '2026-09-22' }), '2026-09-19')).toBe(3);
    expect(getDaysUntilDue(goal(pastEnd), '2026-09-19')).toBe(0);
  });

  it('flags goals that are burning time without progress', () => {
    const start = '2026-09-01';
    const end = '2026-09-30';
    expect(
      isGoalAtRisk(
        goal({ startDate: start, endDate, targetValue: 12, currentValue: 3 }),
        '2026-09-27'
      )
    ).toBe(true);
    expect(
      isGoalAtRisk(
        goal({ startDate: start, endDate, targetValue: 12, currentValue: 3 }),
        '2026-09-10'
      )
    ).toBe(false);
    expect(
      isGoalAtRisk(
        goal({ startDate: start, endDate, targetValue: 12, currentValue: 3, status: 'COMPLETED' }),
        '2026-09-27'
      )
    ).toBe(false);
  });

  it('filters a list down to expired goals', () => {
    const expired = goal({ id: 'g1', ...pastEnd });
    const alive = goal({ id: 'g2', ...futureEnd });
    const result = getExpiredGoals([alive, expired], '2026-09-19');
    expect(result.map(g => g.id)).toEqual(['g1']);
  });

  it('decides whether a goal can be carried over', () => {
    expect(canCarryOver(goal({ status: 'COMPLETED' }))).toBe(false);
    expect(canCarryOver(goal({ status: 'FAILED' }))).toBe(true);
    expect(canCarryOver(goal(pastEnd))).toBe(true);
    expect(canCarryOver(goal(futureEnd))).toBe(false);
  });

  it('builds a carried-over goal with reset progress', () => {
    const carried = createCarryOverGoal(goal({ carryOverCount: 2 }), '2027-01-04');
    expect(carried.title).toBe('Read 12 books (Carried Over)');
    expect(carried.status).toBe('ACTIVE');
    expect(carried.currentValue).toBe(0);
    expect(carried.carryOverCount).toBe(3);
    expect(carried.originalGoalId).toBe('goal-1');
    expect(carried.endDate).toBe('2027-01-04');
  });

  it('suggests a carry-over due date as a YYYY-MM-DD string', () => {
    expect(getSuggestedCarryOverDate(goal({ type: 'WEEKLY' }))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});