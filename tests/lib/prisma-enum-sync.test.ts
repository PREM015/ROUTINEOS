import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BreakType,
  DeviceType,
  FocusEventType,
  FocusReflectionMode,
  FocusSessionEndReason,
  FocusSessionSource,
  FocusSessionType,
  HabitTier,
  SubscriptionPlan,
  SubscriptionStatus,
  Theme,
  HABIT_TIER_DISPLAY_ORDER,
} from '@/constants/prisma-enums';

/**
 * The client-safe enum mirrors must match `prisma/schema.prisma` exactly.
 *
 * This matters more than a normal duplication guard. `src/constants/prisma-enums.ts`
 * exists because `@/generated/prisma` resolves to the Node client entry point, so a
 * `'use client'` component that needs an enum at runtime cannot import it from there
 * without dragging 679 KB of Node client into the browser bundle. The mirror is
 * therefore load-bearing for bundle size, and a member that silently drifts out of it
 * produces a tier chip that quietly never matches a habit.
 *
 * The schema is parsed as a **file** rather than imported from the generated client, so
 * this needs no `DATABASE_URL` and no `prisma generate` ΓÇö it passes on a clean checkout,
 * which is exactly when a mirror is most likely to be wrong.
 */

const SCHEMA_PATH = join(__dirname, '..', '..', 'prisma', 'schema.prisma');
const schema = readFileSync(SCHEMA_PATH, 'utf8');

/**
 * Members of a `enum` block in the schema.
 *
 * Deliberately a narrow parser. It reads the indented lines between `enum Name {` and the
 * closing brace, which is the only shape Prisma emits, and it fails loudly on an enum it
 * cannot find rather than returning an empty list ΓÇö an empty result would make every
 * assertion below pass vacuously.
 */
function schemaEnumMembers(name: string): string[] {
  const start = schema.match(new RegExp(`^enum\\s+${name}\\s*\\{`, 'm'));
  if (!start?.index && start?.index !== 0) {
    throw new Error(`enum ${name} not found in prisma/schema.prisma`);
  }
  const from = (start?.index ?? 0) + start?.[0].length;
  const close = schema.indexOf('\n}', from);
  if (close === -1) throw new Error(`enum ${name} has no closing brace`);

  return schema
    .slice(from, close)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('///'))
    .map((line) => line.split(/[\s@]/)[0])
    .filter((member): member is string => Boolean(member));
}

function mirrorMembers(mirror: Record<string, string>): string[] {
  return Object.keys(mirror).sort();
}

const CASES: Array<[string, Record<string, string>]> = [
  ['DeviceType', DeviceType],
  ['Theme', Theme],
  ['SubscriptionPlan', SubscriptionPlan],
  ['SubscriptionStatus', SubscriptionStatus],
  ['FocusSessionType', FocusSessionType],
  ['FocusSessionEndReason', FocusSessionEndReason],
  ['FocusSessionSource', FocusSessionSource],
  ['FocusEventType', FocusEventType],
  ['FocusReflectionMode', FocusReflectionMode],
  ['BreakType', BreakType],
  ['HabitTier', HabitTier],
];

describe.each(CASES)('%s mirror matches the schema', (name, mirror) => {
  const expected = schemaEnumMembers(name).sort();
  const actual = mirrorMembers(mirror);

  it('has the same members', () => {
    expect(actual).toEqual(expected);
  });

  it('has no value the schema does not', () => {
    expect(actual.filter((member) => !expected.includes(member))).toEqual([]);
  });

  it('is missing nothing the schema declares', () => {
    expect(expected.filter((member) => !actual.includes(member))).toEqual([]);
  });
});

describe('HABIT_TIER_DISPLAY_ORDER', () => {
  it('only names tiers that exist', () => {
    const known = new Set(Object.keys(HabitTier));
    expect(HABIT_TIER_DISPLAY_ORDER.filter((tier) => !known.has(tier))).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(new Set(HABIT_TIER_DISPLAY_ORDER).size).toBe(HABIT_TIER_DISPLAY_ORDER.length);
  });

  it('puts the scored tiers first', () => {
    // The chips are read left to right and the scored tiers are the ones the rate is
    // built from, so burying them behind optional ones would misrepresent what the
    // headline number counts.
    expect(HABIT_TIER_DISPLAY_ORDER[0]).toBe('NON_NEGOTIABLE');
    expect(HABIT_TIER_DISPLAY_ORDER.slice(0, 3)).toEqual([
      'NON_NEGOTIABLE',
      'GROWTH',
      'BONUS',
    ]);
  });

  it('omits UNDEFINED, which is the absence of a tier', () => {
    expect(HABIT_TIER_DISPLAY_ORDER).not.toContain('UNDEFINED');
  });
});
