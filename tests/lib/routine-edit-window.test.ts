import { describe, expect, it } from 'vitest';
import {
  evaluateEditWindow,
  assertWithinEditWindow,
  resolveRetroactiveEditDays,
  EditWindowError,
  DEFAULT_RETROACTIVE_EDIT_DAYS,
} from '@/lib/routine/edit-window';

/**
 * `UserSettings.retroactiveEditDays` had a column, a default of 3, a Settings
 * page and **no server-side reader**: a user who set it to 0 could still rewrite
 * last month's routine logs. These tests pin the rule now that a service
 * enforces it.
 */

const TODAY = '2026-10-01';

describe('resolveRetroactiveEditDays', () => {
  it('falls back to the schema default for a missing value', () => {
    expect(DEFAULT_RETROACTIVE_EDIT_DAYS).toBe(3);
    expect(resolveRetroactiveEditDays(null)).toBe(3);
    expect(resolveRetroactiveEditDays(undefined)).toBe(3);
  });

  it('clamps to the 0-30 range the settings schema allows', () => {
    expect(resolveRetroactiveEditDays(-5)).toBe(0);
    expect(resolveRetroactiveEditDays(0)).toBe(0);
    expect(resolveRetroactiveEditDays(7)).toBe(7);
    expect(resolveRetroactiveEditDays(30)).toBe(30);
    expect(resolveRetroactiveEditDays(999)).toBe(30);
  });

  it('rejects a non-number rather than propagating NaN', () => {
    expect(resolveRetroactiveEditDays(Number.NaN)).toBe(3);
    expect(resolveRetroactiveEditDays(Number.POSITIVE_INFINITY)).toBe(3);
  });

  it('truncates a fractional window', () => {
    expect(resolveRetroactiveEditDays(3.9)).toBe(3);
  });
});

describe('evaluateEditWindow: today and the future are always writable', () => {
  it('allows today even with the window closed', () => {
    expect(evaluateEditWindow(TODAY, TODAY, 0).allowed).toBe(true);
    expect(evaluateEditWindow(TODAY, TODAY, 0).daysAgo).toBe(0);
  });

  it('allows a future date even with the window closed', () => {
    // Planning ahead is the entire point of a routine and is not a retroactive
    // edit, so it must never be blocked.
    const decision = evaluateEditWindow('2026-10-05', TODAY, 0);
    expect(decision.allowed).toBe(true);
    expect(decision.daysAgo).toBe(-4);
  });
});

describe('evaluateEditWindow: the past is measured against the window', () => {
  it('allows yesterday with the default window of 3', () => {
    expect(evaluateEditWindow('2026-09-30', TODAY, 3).allowed).toBe(true);
  });

  it('includes the boundary day itself', () => {
    // A window of 3 means today plus the three preceding days, so the 4th of
    // three is inside and the 5th is not.
    expect(evaluateEditWindow('2026-09-28', TODAY, 3).daysAgo).toBe(3);
    expect(evaluateEditWindow('2026-09-28', TODAY, 3).allowed).toBe(true);
    expect(evaluateEditWindow('2026-09-27', TODAY, 3).daysAgo).toBe(4);
    expect(evaluateEditWindow('2026-09-27', TODAY, 3).allowed).toBe(false);
  });

  it('blocks all of yesterday when the window is off', () => {
    expect(evaluateEditWindow('2026-09-30', TODAY, 0).allowed).toBe(false);
  });

  it('allows a large window to reach back months', () => {
    expect(evaluateEditWindow('2026-07-01', TODAY, 30).allowed).toBe(false);
    expect(evaluateEditWindow('2026-09-05', TODAY, 30).allowed).toBe(true);
  });

  it('measures across a month boundary', () => {
    expect(evaluateEditWindow('2026-09-30', '2026-10-01', 1).allowed).toBe(true);
    expect(evaluateEditWindow('2026-09-29', '2026-10-01', 1).allowed).toBe(false);
  });

  it('measures across a year boundary and a leap day', () => {
    expect(evaluateEditWindow('2025-12-31', '2026-01-01', 1).daysAgo).toBe(1);
    expect(evaluateEditWindow('2024-02-28', '2024-03-01', 2).daysAgo).toBe(2);
  });
});

describe('evaluateEditWindow: the refusal message', () => {
  it('names the window size', () => {
    const decision = evaluateEditWindow('2026-09-01', TODAY, 3);
    expect(decision.reason).toContain('3 days');
    expect(decision.reason).toContain('2026-09-01');
  });

  it('uses the singular for a one-day window', () => {
    expect(evaluateEditWindow('2026-09-01', TODAY, 1).reason).toContain('1 day');
  });

  it('explains a closed window differently from a small one', () => {
    expect(evaluateEditWindow('2026-09-01', TODAY, 0).reason).toContain('window is off');
  });

  it('is empty when the write is allowed', () => {
    expect(evaluateEditWindow(TODAY, TODAY, 3).reason).toBe('');
  });
});

describe('assertWithinEditWindow', () => {
  it('does not throw inside the window', () => {
    expect(() => assertWithinEditWindow('2026-09-30', TODAY, 3)).not.toThrow();
  });

  it('throws an EditWindowError outside it, carrying the numbers', () => {
    expect(() => assertWithinEditWindow('2026-09-01', TODAY, 3)).toThrow(EditWindowError);

    try {
      assertWithinEditWindow('2026-09-01', TODAY, 3);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EditWindowError);
      const typed = error as EditWindowError;
      expect(typed.daysAgo).toBe(30);
      expect(typed.retroactiveEditDays).toBe(3);
      expect(typed.message).toContain('2026-09-01');
    }
  });
});