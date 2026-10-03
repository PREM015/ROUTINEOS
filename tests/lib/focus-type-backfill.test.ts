import { describe, expect, it } from 'vitest';

import {
  FOCUS_SESSION_TYPES,
  FOCUS_TIME_TYPES,
  asFocusSessionType,
  countsAsFocusTime,
  focusTimerPayloadToSessionType,
  focusTypeFromTitle,
  isBreakType,
  sessionTypeToFocusMode,
  titleForFocusType,
} from '@/lib/focus/type-backfill';
import { FocusSessionType } from '@/constants/prisma-enums';

/**
 * The title ⇄ type mapping, in both directions.
 *
 * This mapping is the fix for the original defect: a 5-minute break and a
 * 25-minute focus block lived in the same table distinguished only by a string,
 * so every aggregate that wanted "focus minutes" had to guess — and the timer
 * wrote a *completed* row for each break, so all of them guessed wrong.
 *
 * The reverse mapping exists so the two cannot drift. The failure mode is not a
 * bug in either direction; it is a new mode added in one place and not the other.
 */

describe('focusTypeFromTitle — the backfill', () => {
  it('maps the exact titles the pre-migration code wrote', () => {
    // These literals must match `prisma/sql/001_post_backfill.sql`. If a title
    // changes there it must change here, or the migration writes rows the code
    // will then read as FOCUS.
    expect(focusTypeFromTitle('Focus session')).toBe('FOCUS');
    expect(focusTypeFromTitle('Short break')).toBe('SHORT_BREAK');
    expect(focusTypeFromTitle('Long break')).toBe('LONG_BREAK');
    expect(focusTypeFromTitle('Stopwatch session')).toBe('STOPWATCH');
  });

  it('defaults anything unrecognised to FOCUS', () => {
    // A pure widening: an unrecognised title is counted exactly as the old
    // title-blind aggregations counted it. Never throwing, never dropping.
    expect(focusTypeFromTitle('Deep work on the parser')).toBe('FOCUS');
    expect(focusTypeFromTitle('')).toBe('FOCUS');
    expect(focusTypeFromTitle(null)).toBe('FOCUS');
    expect(focusTypeFromTitle(undefined)).toBe('FOCUS');
  });

  it('is case-sensitive, so a renamed title is never silently reclassified', () => {
    // An approximate match would reclassify a user's own custom-titled session
    // without them knowing, which is worse than leaving it as FOCUS.
    expect(focusTypeFromTitle('short break')).toBe('FOCUS');
    expect(focusTypeFromTitle('SHORT BREAK')).toBe('FOCUS');
  });
});

describe('titleForFocusType', () => {
  it('round-trips with the backfill', () => {
    for (const type of FOCUS_SESSION_TYPES) {
      expect(focusTypeFromTitle(titleForFocusType(type))).toBe(type);
    }
  });
});

describe('focusTimerPayloadToSessionType', () => {
  it('maps the wire format onto the stored enum', () => {
    expect(focusTimerPayloadToSessionType('focus')).toBe('FOCUS');
    expect(focusTimerPayloadToSessionType('short-break')).toBe('SHORT_BREAK');
    expect(focusTimerPayloadToSessionType('long-break')).toBe('LONG_BREAK');
    expect(focusTimerPayloadToSessionType('stopwatch')).toBe('STOPWATCH');
  });

  it('defaults an unknown mode to FOCUS rather than throwing', () => {
    expect(focusTimerPayloadToSessionType('nonsense')).toBe('FOCUS');
  });
});

describe('sessionTypeToFocusMode', () => {
  it('is the exact inverse of the forward mapping', () => {
    for (const type of FOCUS_SESSION_TYPES) {
      const mode = sessionTypeToFocusMode(type);
      expect(focusTimerPayloadToSessionType(mode)).toBe(type);
    }
  });
});

describe('what counts as focus time', () => {
  it('counts FOCUS and STOPWATCH', () => {
    // Both are real work the user chose to do. A stopwatch run is a deep-work
    // block the user measured themselves.
    expect(FOCUS_TIME_TYPES).toEqual(['FOCUS', 'STOPWATCH']);
    expect(countsAsFocusTime('FOCUS')).toBe(true);
    expect(countsAsFocusTime('STOPWATCH')).toBe(true);
  });

  it('never counts a break', () => {
    // The defect this whole column exists to fix.
    expect(countsAsFocusTime('SHORT_BREAK')).toBe(false);
    expect(countsAsFocusTime('LONG_BREAK')).toBe(false);
  });

  it('recognises both break types', () => {
    expect(isBreakType('SHORT_BREAK')).toBe(true);
    expect(isBreakType('LONG_BREAK')).toBe(true);
    expect(isBreakType('FOCUS')).toBe(false);
    expect(isBreakType('STOPWATCH')).toBe(false);
  });
});

describe('asFocusSessionType', () => {
  it('accepts every enum member', () => {
    for (const type of FOCUS_SESSION_TYPES) {
      expect(asFocusSessionType(type)).toBe(type);
    }
  });

  it('rejects anything else, so API input cannot invent a type', () => {
    expect(asFocusSessionType('NONSENSE')).toBeNull();
    expect(asFocusSessionType(null)).toBeNull();
    expect(asFocusSessionType(42)).toBeNull();
  });
});

describe('the client-safe mirror', () => {
  it('stays in sync with the generated Prisma enum', () => {
    // The reason this mirror exists: `src/generated/prisma` is the Node client
    // entry point, so importing an enum from it as a *value* inside a `'use
    // client'` file pulls Node built-ins into the browser bundle.
    for (const type of FOCUS_SESSION_TYPES) {
      expect(FocusSessionType[type]).toBe(type);
    }
  });
});
