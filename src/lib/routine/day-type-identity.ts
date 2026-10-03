import type { DayType } from '@/generated/prisma';

/**
 * Day-type *identity* for the routine page's tabs.
 *
 * ## The bug this exists to prevent
 *
 * `DayType` is a six-value enum (`WORKDAY | WEEKEND | HOLIDAY | EXAM_DAY |
 * LOW_ENERGY | CUSTOM`) in which **every user-defined day type collapses to
 * `CUSTOM`**. Selecting tabs by that value made all of them the same tab: a user
 * with "College Day" and "Focus Day" had two tabs that both stored `'CUSTOM'`,
 * so clicking the second one left the first one's blocks on screen and the block
 * count in the header could not tell them apart. Two custom day types were not
 * independent, because nothing could address them separately.
 *
 * ## The rule
 *
 * **Identity is the `DayTypeDefinition.id`.** It is a real, stable, unique key.
 * The enum value is only a *classification* — a convenient label and a fallback
 * for a template with no definition attached — and must never be used as a
 * primary key.
 *
 * The one exception is the canonical fallback tab list, used only when the
 * account genuinely has no `DayTypeDefinition` rows at all. Those have no id to
 * key on and their enum values *are* distinct, so the enum value is the correct
 * key for them and for them alone.
 */

/** The minimum a tab needs to know its own identity. */
export interface RoutineTabIdentity {
  /** The `DayTypeDefinition.id`. Absent only for a canonical fallback tab. */
  dayTypeId?: string | null;
  /** The classification, derived from the definition's slug. */
  value: DayType;
}

/**
 * The key a tab is selected and addressed by.
 *
 * Prefers the definition id and falls back to the enum value, so both a real
 * day type and a canonical fallback tab produce a stable, collision-free key
 * within the same strip.
 *
 * The `id:` prefix on the fallback branch is not cosmetic. Without it a
 * canonical `CUSTOM` tab and a real definition id could theoretically collide,
 * and more practically it makes the two key spaces visibly distinct in devtools
 * when debugging which branch produced the selected tab.
 */
export function routineTabKey(tab: RoutineTabIdentity): string {
  return tab.dayTypeId ? `id:${tab.dayTypeId}` : `enum:${tab.value}`;
}

/** Does this tab correspond to the given selection? */
export function isTabSelected(
  tab: RoutineTabIdentity,
  selectedKey: string | null
): boolean {
  return routineTabKey(tab) === selectedKey;
}

/**
 * Does a block belong to the selected day type?
 *
 * Prefers `dayTypeId`, because that is the only field that distinguishes two
 * `CUSTOM` blocks. Falls back to the enum classification **only** when the
 * selection itself is an enum key — i.e. the account has no definitions and the
 * user is looking at a canonical fallback tab. Comparing `dayTypeId` against an
 * enum-keyed selection would match nothing, which is why the two branches are
 * symmetric rather than `dayTypeId`-only.
 */
export function blockMatchesSelection(
  block: { dayType?: string | null; dayTypeId?: string | null },
  selection: string | null
): boolean {
  if (!selection) return true;

  if (selection.startsWith('id:')) {
    const wanted = selection.slice('id:'.length);
    // A block whose template has no definition attached cannot be matched to a
    // definition-keyed selection. Returning false is the honest answer: it
    // belongs to the legacy enum-only template, not to the chosen day type.
    return block.dayTypeId != null && block.dayTypeId === wanted;
  }

  if (selection.startsWith('enum:')) {
    const wanted = selection.slice('enum:'.length);
    return block.dayType === wanted;
  }

  // An unrecognised key (a hand-edited URL) matches nothing rather than
  // silently matching everything.
  return false;
}

/**
 * Parse a `?day=` URL parameter into a selection key.
 *
 * Accepts both forms so a link written by an older version of the page (a bare
 * enum value) still resolves, while new links carry the id.
 */
export function parseTabSelection(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('id:') || trimmed.startsWith('enum:')) return trimmed;
  return `enum:${trimmed}`;
}