import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_FOCUS_DURATIONS,
  minutesFor,
  plannedMsFor,
  shouldAutoStartNext,
} from '@/lib/focus/durations';

/**
 * The durations module replaced two hardcoded `25 * 60_000` literals - one in the
 * store's initial state and one as the runtime's restore fallback - neither of which
 * read `FocusSettings`. So the values here are the ones that decide how long a focus
 * block actually runs.
 */

describe('plannedMsFor', () => {
  const custom = { focusMinutes: 50, shortBreakMinutes: 7, longBreakMinutes: 20 };

  it('reads each mode from settings rather than a literal', () => {
    expect(plannedMsFor('focus', custom)).toBe(50 * 60_000);
    expect(plannedMsFor('short-break', custom)).toBe(7 * 60_000);
    expect(plannedMsFor('long-break', custom)).toBe(20 * 60_000);
  });

  it('gives a stopwatch no planned length', () => {
    // A stopwatch counts up. Returning a number here would make the dial render a
    // countdown arc for a mode that has no end.
    expect(plannedMsFor('stopwatch', custom)).toBeNull();
    expect(minutesFor('stopwatch', custom)).toBeNull();
  });

  it('clamps a zero or negative setting to one minute', () => {
    // Zero would make `endsAt <= startedAt`, and the timer would report the session
    // as finished before it began.
    expect(plannedMsFor('focus', { ...custom, focusMinutes: 0 })).toBe(60_000);
    expect(plannedMsFor('focus', { ...custom, focusMinutes: -10 })).toBe(60_000);
  });

  it('defaults to the schema values when given nothing', () => {
    expect(plannedMsFor('focus')).toBe(DEFAULT_FOCUS_DURATIONS.focusMinutes * 60_000);
  });
});

describe('DEFAULT_FOCUS_DURATIONS matches the FocusSettings schema', () => {
  /*
   * The constant exists so `durations.ts` can stay a pure leaf with no import from the
   * metrics glossary, which means it duplicates the Prisma column defaults. This is the
   * test that stops the duplication from silently drifting - if a default is changed in
   * `schema.prisma` and not here, the client would show one length and the server would
   * store another.
   */
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');

  function columnDefault(name: string): number {
    const field = new RegExp(`${name}\\s+Int\\s+@default\\((\\d+)\\)`);
    const match = field.exec(schema);
    expect(match, `FocusSettings.${name} default not found in schema.prisma`).not.toBeNull();
    return Number(match![1]);
  }

  it('pins focusMinutes', () => {
    expect(DEFAULT_FOCUS_DURATIONS.focusMinutes).toBe(columnDefault('focusMinutes'));
  });

  it('pins shortBreakMinutes', () => {
    expect(DEFAULT_FOCUS_DURATIONS.shortBreakMinutes).toBe(columnDefault('shortBreakMinutes'));
  });

  it('pins longBreakMinutes', () => {
    expect(DEFAULT_FOCUS_DURATIONS.longBreakMinutes).toBe(columnDefault('longBreakMinutes'));
  });
});

describe('shouldAutoStartNext', () => {
  const settings = {
    autoStartBreak: true,
    autoStartFocus: false,
    cyclesBeforeLongBreak: 4,
  };

  it('is null for a stopwatch, which has no cycle to advance', () => {
    expect(shouldAutoStartNext('stopwatch', settings, 3)).toBeNull();
  });

  it('honours autoStartBreak independently of autoStartFocus', () => {
    // Two separate settings because two separate questions. Reading one to imply the
    // other is how a user ends up in a chain of focus blocks they did not ask for.
    expect(shouldAutoStartNext('focus', settings, 1)).toBe('short-break');
    expect(
      shouldAutoStartNext('short-break', { ...settings, autoStartFocus: false }, 1)
    ).toBeNull();
    expect(shouldAutoStartNext('short-break', { ...settings, autoStartFocus: true }, 1)).toBe(
      'focus'
    );
  });

  it('promotes to a long break on the cycle boundary', () => {
    expect(shouldAutoStartNext('focus', settings, 4)).toBe('long-break');
    expect(shouldAutoStartNext('focus', settings, 8)).toBe('long-break');
  });

  it('takes the new boundary into account when the cycle count is lowered', () => {
    // Waiting out the old cycle would mean lowering the setting appeared to do nothing
    // for up to three blocks.
    const shorter = { ...settings, cyclesBeforeLongBreak: 2 };
    expect(shouldAutoStartNext('focus', shorter, 2)).toBe('long-break');
  });

  it('does not treat zero completed cycles as a boundary', () => {
    expect(shouldAutoStartNext('focus', settings, 0)).toBe('short-break');
  });
});