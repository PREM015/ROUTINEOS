import { describe, expect, it, vi } from 'vitest';

import {
  abandonSession,
  coerceDate,
  completeSession,
  createSessionState,
  restoreSession,
} from '../../src/lib/focus/session-manager';
import {
  buildTimeline,
  computeCycle,
  cycleLengthMinutes,
  durationForPhase,
  isCycleComplete,
  nextPhaseFor,
  POMODORO_DEFAULTS,
} from '../../src/lib/focus/pomodoro';
import {
  focusSummary,
  productiveTimes,
  sessionMinutes,
} from '../../src/lib/focus/analytics';
import { isValidFocusTimerState } from '../../src/types/focus';
import { makeFocusSession } from '../utils/factories';

vi.mock('@/types/focus', async () => ({
  ...(await import('../../src/types/focus')),
}));

describe('focus session manager', () => {
  describe('createSessionState', () => {
    it('builds a fresh running snapshot for the planned duration', () => {
      const state = createSessionState(25, 's1', new Date('2026-09-17T09:00:00.000Z'));
      expect(state.sessionId).toBe('s1');
      expect(state.state).toBe('RUNNING');
      expect(state.elapsedSeconds).toBe(0);
      expect(state.remainingSeconds).toBe(1500);
      expect(state.progressPercentage).toBe(0);
      expect(state.endsAt?.toISOString()).toBe('2026-09-17T09:25:00.000Z');
    });

    it('rejects non-positive durations', () => {
      expect(() => createSessionState(0)).toThrow(TypeError);
      expect(() => createSessionState(-5)).toThrow(TypeError);
      expect(() => createSessionState(Number.NaN)).toThrow(TypeError);
      expect(() => createSessionState(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    });

    it('rejects invalid start dates', () => {
      expect(() => createSessionState(25, 's1', new Date('nope'))).toThrow(TypeError);
    });
  });

  describe('completeSession', () => {
    const startedAt = new Date('2026-09-17T09:00:00.000Z');
    const snapshot = createSessionState(25, 's1', startedAt);

    it('reports the elapsed duration when the timer ends on time', () => {
      const result = completeSession(snapshot, new Date('2026-09-17T09:25:00.000Z'));
      expect(result.durationSeconds).toBe(1500);
      expect(result.truncated).toBe(false);
    });

    it('caps the duration at the planned length and flags overruns', () => {
      const result = completeSession(snapshot, new Date('2026-09-17T09:40:00.000Z'));
      expect(result.durationSeconds).toBe(1500);
      expect(result.truncated).toBe(true);
    });

    it('clamps durations to a minimum of zero', () => {
      expect(completeSession(snapshot, startedAt).durationSeconds).toBe(0);
    });
  });

  describe('abandonSession', () => {
    it('freezes the timer at the current elapsed time as CANCELLED', () => {
      const startedAt = new Date('2026-09-17T09:00:00.000Z');
      const snapshot = createSessionState(25, 's1', startedAt);
      const cancelled = abandonSession(snapshot, new Date('2026-09-17T09:07:00.000Z'));
      expect(cancelled.state).toBe('CANCELLED');
      expect(cancelled.elapsedSeconds).toBe(420);
      expect(cancelled.remainingSeconds).toBe(0);
      expect(cancelled.progressPercentage).toBe(100);
    });
  });

  describe('restoreSession', () => {
    it('rehydrates a valid raw snapshot', () => {
      const restored = restoreSession({
        sessionId: 's1',
        state: 'PAUSED',
        startedAt: '2026-09-17T09:00:00.000Z',
        endsAt: '2026-09-17T09:25:00.000Z',
        elapsedSeconds: 600,
        remainingSeconds: 900,
      });
      expect(restored.sessionId).toBe('s1');
      expect(restored.state).toBe('PAUSED');
      expect(restored.elapsedSeconds).toBe(600);
      expect(restored.progressPercentage).toBe(40);
    });

    it('rejects malformed snapshots', () => {
      expect(() => restoreSession(null)).toThrow(TypeError);
      expect(() => restoreSession({})).toThrow(TypeError);
      expect(() =>
        restoreSession({ sessionId: 's1', state: 'BOGUS', startedAt: '2026-09-17T09:00:00.000Z' })
      ).toThrow(TypeError);
      expect(() =>
        restoreSession({ sessionId: 's1', state: 'RUNNING', startedAt: 'nope' })
      ).toThrow(TypeError);
      expect(() =>
        restoreSession({
          sessionId: 's1',
          state: 'RUNNING',
          startedAt: '2026-09-17T09:00:00.000Z',
          elapsedSeconds: -1,
          remainingSeconds: 0,
        })
      ).toThrow(TypeError);
    });
  });

  describe('coerceDate and validators', () => {
    it('coerces dates, timestamps, and ISO strings', () => {
      const date = new Date('2026-09-17T09:00:00.000Z');
      expect(coerceDate(date)).toEqual(date);
      expect(coerceDate(date.getTime())).toEqual(date);
      expect(coerceDate('2026-09-17T09:00:00.000Z')).toEqual(date);
    });

    it('returns null for nullish and unrecognized input', () => {
      expect(coerceDate(null)).toBeNull();
      expect(coerceDate(undefined)).toBeNull();
      expect(coerceDate('')).toBeNull();
      expect(coerceDate('garbage')).toBeNull();
    });

    it('validates focus timer states', () => {
      expect(isValidFocusTimerState('RUNNING')).toBe(true);
      expect(isValidFocusTimerState('NOPE')).toBe(false);
    });
  });
});

describe('pomodoro logic', () => {
  it('exposes sensible defaults', () => {
    expect(POMODORO_DEFAULTS).toEqual({
      workMinutes: 25,
      shortBreak: 5,
      longBreak: 15,
      cyclesBeforeLongBreak: 4,
    });
  });

  it('maps each phase to its runtime duration', () => {
    expect(durationForPhase('WORK')).toBe(25);
    expect(durationForPhase('SHORT_BREAK')).toBe(5);
    expect(durationForPhase('LONG_BREAK')).toBe(15);
  });

  it('schedules a long break every 4th completed cycle', () => {
    expect(nextPhaseFor('WORK', 3)).toBe('LONG_BREAK');
    expect(nextPhaseFor('WORK', 2)).toBe('SHORT_BREAK');
    expect(nextPhaseFor('SHORT_BREAK', 2)).toBe('WORK');
  });

  it('computes cycle progress with remaining time and next phase', () => {
    const phaseStartedAt = new Date(Date.now() - 10 * 60_000);
    const cycle = computeCycle({
      currentPhase: 'WORK',
      phaseStartedAt,
      completedCycles: 0,
      state: 'RUNNING',
    });
    expect(cycle.phase).toBe('WORK');
    expect(cycle.phaseComplete).toBe(false);
    expect(cycle.remainingMs).toBe(15 * 60_000);
    expect(cycle.nextPhase).toBe('SHORT_BREAK');
  });

  it('marks a phase complete once its budget elapses', () => {
    const phaseStartedAt = new Date(Date.now() - 26 * 60_000);
    const cycle = computeCycle({
      currentPhase: 'WORK',
      phaseStartedAt,
      completedCycles: 0,
      state: 'RUNNING',
    });
    expect(cycle.phaseComplete).toBe(true);
    expect(cycle.remainingMs).toBe(0);
  });

  it('builds a work/break timeline across the session', () => {
    expect(buildTimeline(55)).toEqual([
      { startMinute: 0, endMinute: 25, phase: 'WORK' },
      { startMinute: 25, endMinute: 30, phase: 'SHORT_BREAK' },
      { startMinute: 30, endMinute: 55, phase: 'WORK' },
    ]);
  });

  it('inserts a long break after the 4th cycle', () => {
    const timeline = buildTimeline(130);
    expect(timeline.filter(segment => segment.phase === 'LONG_BREAK')).toHaveLength(1);
    expect(timeline[4]?.phase).toBe('LONG_BREAK');
  });

  it('detects completed cycles', () => {
    const startedAt = new Date(Date.now() - 26 * 60_000);
    expect(isCycleComplete({ phase: 'WORK', startedAt })).toBe(true);
    expect(isCycleComplete({ phase: 'WORK', startedAt: new Date() })).toBe(false);
  });

  it('computes the length of a full cycle', () => {
    expect(cycleLengthMinutes()).toBe(30);
    expect(cycleLengthMinutes({ workMinutes: 50, shortBreak: 10 })).toBe(60);
  });
});

describe('focus analytics', () => {
  it('falls back to planned duration when actual is missing', () => {
    expect(sessionMinutes({ plannedDuration: 25, actualDuration: 30 })).toBe(30);
    expect(sessionMinutes({ plannedDuration: 25, actualDuration: null })).toBe(25);
  });

  it('aggregates a session summary', () => {
    const sessions = [
      makeFocusSession({
        plannedDuration: 25,
        actualDuration: 30,
        completedAt: new Date('2026-09-17T09:25:00.000Z'),
        focusRating: 4,
      }),
      makeFocusSession({
        id: 'focus-2',
        plannedDuration: 50,
        actualDuration: null,
        completedAt: null,
        focusRating: 3,
      }),
    ] as Parameters<typeof focusSummary>[0];

    const summary = focusSummary(sessions);
    expect(summary.totalSessions).toBe(2);
    expect(summary.completedSessions).toBe(1);
    expect(summary.completionRate).toBe(0.5);
    expect(summary.totalPlannedMinutes).toBe(75);
    expect(summary.totalActualMinutes).toBe(80);
    expect(summary.averageSessionDuration).toBe(40);
    expect(summary.averageFocusRating).toBe(3.5);

    expect(focusSummary([]).totalSessions).toBe(0);
    expect(focusSummary([]).completionRate).toBe(0);
  });

  it('ranks productive hours by minutes spent', () => {
    const morning = new Date('2026-09-17T09:00:00.000Z');
    const afternoon = new Date('2026-09-17T14:00:00.000Z');
    const sessions = [
      makeFocusSession({ startedAt: morning, plannedDuration: 25 }),
      makeFocusSession({
        id: 'focus-2',
        startedAt: morning,
        plannedDuration: 50,
        completedAt: new Date('2026-09-17T09:50:00.000Z'),
        focusRating: 5,
      }),
      makeFocusSession({ id: 'focus-3', startedAt: afternoon, plannedDuration: 25 }),
    ] as Parameters<typeof productiveTimes>[0];

    const buckets = productiveTimes(sessions);
    expect(buckets.length).toBeGreaterThan(0);
    const morningBucket = buckets.find(bucket => bucket.hour === morning.getHours());
    expect(morningBucket?.totalMinutes).toBe(75);
    expect(buckets[0]?.hour).toBe(morning.getHours());
    const afternoonBucket = buckets.find(bucket => bucket.hour === afternoon.getHours());
    expect(afternoonBucket?.totalMinutes).toBe(25);
  });
});