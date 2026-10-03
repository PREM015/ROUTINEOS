'use client';

/**
 * Day-type presentation, re-exported from its real home.
 *
 * `DAY_TYPE_CONFIG` used to be a literal table here. It now lives in
 * `constants/day-types.ts`, derived from `DEFAULT_DAY_TYPES` so the two cannot
 * drift, and is re-exported from here because four call sites already import it
 * from this path. Those imports resolve lazily in the client bundle, so deleting
 * the export broke the *build* while `tsc --noEmit` still passed — see the note
 * on the definition itself.
 */
/**
 * The shape of a block in a seeded template.
 *
 * A type only — the seeded `DEFAULT_WORKDAY_ROUTINE` data that used to sit beside
 * it is now built from the `DEFAULT_DAY_TYPES` table and lives in
 * `lib/constants/templates.ts`, which is the only consumer.
 */
export interface DefaultRoutineBlock {
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  energyLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  trackCompletion?: boolean;
  color?: string;
  icon?: string;
}

/**
 * Day-type helpers, re-exported from their real home in
 * `constants/day-types.ts`.
 *
 * These all used to be literals here. They now live beside `DEFAULT_DAY_TYPES`,
 * which is the authoritative day-type table, and are re-exported because a dozen
 * call sites already import them from this path.
 *
 * The alias names are the ones those call sites use, kept so no import had to
 * change: `ENUM_TO_SLUG` is `ENUM_VALUE_TO_DAY_TYPE_SLUG`, and `slugToDayType` is
 * `enumValueForSlug`.
 */
export { DAY_TYPE_CONFIG, DAY_TYPES_ORDERED, isDayType } from '@/constants/day-types';
export { ENUM_VALUE_TO_DAY_TYPE_SLUG as ENUM_TO_SLUG } from '@/constants/day-types';
export { enumValueForSlug as slugToDayType } from '@/constants/day-types';

/**
 * Routine block colour resolution.
 *
 * ## The problem this solves
 *
 * `BlockCard` resolved its accent as `block.color ?? block.category?.color ??
 * null`, and `--glass-hue` then fell back to `var(--primary)`. Because
 * `RoutineBlock.color` is a nullable free-text column that most users never
 * fill in, **the common case was the fallback** — so a whole day of blocks
 * rendered as one shade of green. The colour channel carried no information at
 * all, which is what made the schedule read as simple and grey despite the
 * material supporting a full tint.
 *
 * ## The rule
 *
 * Colour here is **identity, and it is semantic**. Resolution order:
 *
 * 1. `block.color` — an explicit user choice always wins. Never overridden.
 * 2. `block.category.color` — so every "Work" block in the day is the same hue
 *    wherever it appears, and the day reads as a set of kinds rather than a set
 *    of unrelated tasks.
 * 3. A stable hash of the block id → one of eight `--block-hue-*` tokens.
 *
 * Only an uncategorised block with no colour reaches step 3, and the hash is
 * deliberately *not* random: a block keeps its hue when the day is reordered,
 * when the template is edited, and across reloads. A random assignment would
 * recolour the whole schedule on every render, which reads as noise.
 *
 * ## Why eight
 *
 * Enough that adjacent blocks rarely collide, few enough that a day is still
 * legible as a palette rather than a bag of sweets. Every hue clears 4.5:1 as
 * text on `--card` in both themes, which is why the values live in CSS and are
 * referenced through `var()` rather than inlined here — dark mode then needs no
 * second branch anywhere in the component tree.
 */

const HUE_COUNT = 8;

export const BLOCK_HUE_VARS = [
  'var(--block-hue-1)',
  'var(--block-hue-2)',
  'var(--block-hue-3)',
  'var(--block-hue-4)',
  'var(--block-hue-5)',
  'var(--block-hue-6)',
  'var(--block-hue-7)',
  'var(--block-hue-8)',
] as const;

/**
 * FNV-1a, 32-bit.
 *
 * Chosen over a naive char-code sum because that one is heavily biased: it puts
 * ids differing only in their last character in the same bucket, so two blocks
 * created seconds apart land on the same hue. FNV-1a mixes every character into
 * every subsequent one, so adjacent ids scatter across the palette.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 16777619 is FNV's 32-bit prime, done with shifts so it stays in int32
    // without overflowing into float precision.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The palette entry for a block id. Stable for a given id, forever. */
export function hueVarForId(id: string): string {
  if (!id) return BLOCK_HUE_VARS[0]!;
  return BLOCK_HUE_VARS[fnv1a(id) % HUE_COUNT]!;
}

/** The minimum surface a block carries. */
export interface BlockColorSource {
  id: string;
  color?: string | null;
  category?: { color?: string | null } | null;
}

/**
 * The hue a block should wear, and where that decision came from.
 *
 * `source` is returned as well as the colour so callers can *explain* it — the
 * editor shows "inherits Work" rather than an unexplained swatch, which is what
 * stops a user overriding a colour they did not know was inherited.
 */
export function resolveBlockColor(source: BlockColorSource): {
  hue: string;
  source: 'block' | 'category' | 'palette';
} {
  const own = source.color?.trim();
  if (own) return { hue: own, source: 'block' };

  const category = source.category?.color?.trim();
  if (category) return { hue: category, source: 'category' };

  return { hue: hueVarForId(source.id), source: 'palette' };
}

/** Convenience wrapper for call sites that only want the colour. */
export function blockHue(source: BlockColorSource): string {
  return resolveBlockColor(source).hue;
}

/**
 * A chip background/text pair derived from an arbitrary hue.
 *
 * The repo already has `accentChipStyle` in `@/lib/utils`, which does the same
 * arithmetic. This exists only to name the *routine* case: a chip needs a
 * slightly stronger tint than a 16% wash to stay legible on a capsule that is
 * itself already tinted, so the mixes are pushed a few points.
 */
export function blockChipStyle(hue: string): {
  backgroundColor: string;
  color: string;
} {
  return {
    backgroundColor: `color-mix(in oklab, ${hue} 18%, var(--card))`,
    color: `color-mix(in oklab, ${hue} 78%, var(--foreground))`,
  };
}