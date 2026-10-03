import { describe, expect, it } from 'vitest';
import {
  routineTabKey,
  isTabSelected,
  blockMatchesSelection,
  parseTabSelection,
} from '@/lib/routine/day-type-identity';
import { slugToDayType, isDayType, ENUM_TO_SLUG, DAY_TYPES_ORDERED } from '@/constants/routine';

/**
 * The routine page used to select its day-type tab by a `DayType` enum value.
 * That enum has six members and every *user-defined* day type collapses to
 * `CUSTOM`, so two custom day types were the same tab: selecting the second one
 * left the first one's blocks on screen and the header's block count could not
 * tell them apart. Identity is the `DayTypeDefinition.id`; these tests pin that.
 */

describe('routineTabKey distinguishes two custom day types', () => {
  it('gives two CUSTOM day types different keys', () => {
    const college = routineTabKey({ dayTypeId: 'clx1', value: 'CUSTOM' });
    const focus = routineTabKey({ dayTypeId: 'clx2', value: 'CUSTOM' });
    expect(college).not.toBe(focus);
  });

  it('gives the same day type a stable key', () => {
    expect(routineTabKey({ dayTypeId: 'clx1', value: 'CUSTOM' })).toBe(
      routineTabKey({ dayTypeId: 'clx1', value: 'CUSTOM' })
    );
  });

  it('never collides with an enum-keyed fallback tab', () => {
    const withId = routineTabKey({ dayTypeId: 'CUSTOM', value: 'CUSTOM' });
    const fallback = routineTabKey({ value: 'CUSTOM' });
    expect(withId).not.toBe(fallback);
  });

  it('keys a canonical fallback tab by its enum value', () => {
    expect(routineTabKey({ value: 'WORKDAY' })).toBe('enum:WORKDAY');
    expect(routineTabKey({ value: 'WEEKEND' })).toBe('enum:WEEKEND');
  });

  it('treats a null or empty id as "no definition"', () => {
    expect(routineTabKey({ dayTypeId: null, value: 'HOLIDAY' })).toBe('enum:HOLIDAY');
    expect(routineTabKey({ dayTypeId: '', value: 'HOLIDAY' })).toBe('enum:HOLIDAY');
  });

  it('gives every canonical fallback tab a distinct key', () => {
    const keys = DAY_TYPES_ORDERED.map((value) => routineTabKey({ value }));
    expect(new Set(keys).size).toBe(DAY_TYPES_ORDERED.length);
  });
});

describe('isTabSelected', () => {
  it('matches on the key, not on the classification', () => {
    const tabs = [
      { dayTypeId: 'a', value: 'CUSTOM' as const },
      { dayTypeId: 'b', value: 'CUSTOM' as const },
    ];
    const selection = routineTabKey(tabs[1]!);
    expect(isTabSelected(tabs[0]!, selection)).toBe(false);
    expect(isTabSelected(tabs[1]!, selection)).toBe(true);
  });

  it('selects nothing when there is no selection', () => {
    expect(isTabSelected({ dayTypeId: 'a', value: 'CUSTOM' }, null)).toBe(false);
  });
});

describe('blockMatchesSelection', () => {
  it('routes two custom day types to two disjoint block sets', () => {
    const blocks = [
      { id: 'college', dayType: 'CUSTOM', dayTypeId: 'a' },
      { id: 'lecture', dayType: 'CUSTOM', dayTypeId: 'a' },
      { id: 'focus', dayType: 'CUSTOM', dayTypeId: 'b' },
    ];
    const collegeKey = routineTabKey({ dayTypeId: 'a', value: 'CUSTOM' });
    const focusKey = routineTabKey({ dayTypeId: 'b', value: 'CUSTOM' });

    expect(blocks.filter((b) => blockMatchesSelection(b, collegeKey)).map((b) => b.id)).toEqual([
      'college',
      'lecture',
    ]);
    expect(blocks.filter((b) => blockMatchesSelection(b, focusKey)).map((b) => b.id)).toEqual([
      'focus',
    ]);
  });

  it('excludes a legacy block with no definition from an id-keyed selection', () => {
    // A template created before `dayTypeId` existed cannot be attributed to a
    // specific day type. Returning false is honest; returning true would show
    // it under every custom tab at once.
    const legacy = { dayType: 'CUSTOM', dayTypeId: null };
    expect(blockMatchesSelection(legacy, routineTabKey({ dayTypeId: 'a', value: 'CUSTOM' }))).toBe(
      false
    );
  });

  it('matches by classification only for an enum-keyed selection', () => {
    const workday = { dayType: 'WORKDAY', dayTypeId: 'd1' };
    const weekend = { dayType: 'WEEKEND', dayTypeId: 'd2' };
    expect(blockMatchesSelection(workday, 'enum:WORKDAY')).toBe(true);
    expect(blockMatchesSelection(weekend, 'enum:WORKDAY')).toBe(false);
  });

  it('shows everything when no day type has been chosen', () => {
    expect(blockMatchesSelection({ dayType: 'CUSTOM', dayTypeId: 'a' }, null)).toBe(true);
  });

  it('matches nothing for an unrecognised key rather than everything', () => {
    // A hand-edited `?day=` must not silently widen the filter to the whole day.
    expect(blockMatchesSelection({ dayType: 'CUSTOM', dayTypeId: 'a' }, 'garbage')).toBe(false);
  });
});

describe('parseTabSelection', () => {
  it('reads an id key through the URL unchanged', () => {
    expect(parseTabSelection('id:clx1')).toBe('id:clx1');
  });

  it('treats a bare enum value as an enum key, for older links', () => {
    expect(parseTabSelection('WORKDAY')).toBe('enum:WORKDAY');
    expect(parseTabSelection('CUSTOM')).toBe('enum:CUSTOM');
  });

  it('is null for absent or blank values', () => {
    expect(parseTabSelection(null)).toBeNull();
    expect(parseTabSelection(undefined)).toBeNull();
    expect(parseTabSelection('')).toBeNull();
    expect(parseTabSelection('   ')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(parseTabSelection('  WORKDAY  ')).toBe('enum:WORKDAY');
  });
});

describe('slugToDayType classifies but never identifies', () => {
  it('maps the canonical slugs to their enum members', () => {
    for (const [enumValue, slug] of Object.entries(ENUM_TO_SLUG)) {
      expect(slugToDayType(slug)).toBe(enumValue);
    }
  });

  it('maps user-defined slugs to CUSTOM, which is why ids are required', () => {
    expect(slugToDayType('college-day')).toBe('CUSTOM');
    expect(slugToDayType('deep-work')).toBe('CUSTOM');
  });

  it('accepts spaces and underscores in place of dashes', () => {
    expect(slugToDayType('work day')).toBe('WORKDAY');
    expect(slugToDayType('work_day')).toBe('WORKDAY');
    expect(slugToDayType('LOW ENERGY DAY')).toBe('LOW_ENERGY');
  });

  it('is CUSTOM for missing or nonsense input', () => {
    expect(slugToDayType(null)).toBe('CUSTOM');
    expect(slugToDayType(undefined)).toBe('CUSTOM');
    expect(slugToDayType('')).toBe('CUSTOM');
    expect(slugToDayType('!!!')).toBe('CUSTOM');
  });
});

describe('isDayType', () => {
  it('accepts only real enum members', () => {
    expect(isDayType('WORKDAY')).toBe(true);
    expect(isDayType('CUSTOM')).toBe(true);
    // 'WEEKDAY' is the non-existent value that a hand-written day-type list let
    // through the client and the API once.
    expect(isDayType('WEEKDAY')).toBe(false);
    expect(isDayType('work-day')).toBe(false);
    expect(isDayType(42)).toBe(false);
    expect(isDayType(null)).toBe(false);
  });
});