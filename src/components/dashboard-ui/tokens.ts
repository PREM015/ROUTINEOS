/**
 * Semantic tokens for `/dashboard`.
 *
 * Every value here used to be a raw Tailwind palette class at a call site —
 * `bg-emerald-500`, `text-amber-500`, `bg-sky-500` and so on, 57 occurrences
 * across the dashboard tree. That is how the same concept ends up three
 * different shades in three files: `text-emerald-500` for "done" here,
 * `text-emerald-600` there, and `text-emerald-400` in a third place, with
 * `dark:` variants present in some and missing in others.
 *
 * Each entry resolves to a theme custom property or a `color-mix` against one,
 * so:
 *   - a hue is defined in exactly one place (`globals.css` / `accent.ts`)
 *   - dark mode is a token swap, not a per-call-site `dark:` class
 *   - "emerald means done" is a single fact rather than 57 coincidences
 *
 * The distinction the spec insists on is preserved: **identity** hues
 * (`DOMAIN_ACCENT`) are for identity, **status** tokens below are for actual
 * state. When the user sees red, it means something.
 */

import { accentTint } from './accent';

// ---------------------------------------------------------------------------
// Status — reserved for real state changes
// ---------------------------------------------------------------------------

export const STATUS = {
  success: 'var(--color-emerald-500)',
  warning: 'var(--color-amber-500)',
  danger: 'var(--color-destructive)',
  neutral: 'var(--muted-foreground)',
} as const;

export type StatusKey = keyof typeof STATUS;

/** A 12%-alpha wash of a status colour, for chips and soft backgrounds. */
export function statusTint(key: StatusKey, percent = 12): string {
  return accentTint(STATUS[key], percent);
}

// ---------------------------------------------------------------------------
// Habit health
// ---------------------------------------------------------------------------

export type HealthKey = 'HEALTHY' | 'AT_RISK' | 'UNHEALTHY' | 'NO_DATA';

/**
 * Thresholds live in `habit.service.ts:518` and are hard-coded there as
 * 75 / 40. They are repeated here as documentation only — if you change one,
 * change both, or the colour and the classification will disagree.
 */
export const HEALTH_META: Record<
  HealthKey,
  { label: string; tone: StatusKey | null; text: string }
> = {
  HEALTHY: { label: 'Healthy', tone: 'success', text: 'text-emerald-600 dark:text-emerald-400' },
  AT_RISK: { label: 'At risk', tone: 'warning', text: 'text-amber-600 dark:text-amber-400' },
  UNHEALTHY: { label: 'Unhealthy', tone: 'danger', text: 'text-destructive' },
  NO_DATA: { label: 'No data', tone: null, text: 'text-muted-foreground' },
};

// ---------------------------------------------------------------------------
// Habit tier dots
// ---------------------------------------------------------------------------

/**
 * The tier dot colours previously lived in `HabitHealthWidget` as a
 * `TIER_DOT` record of raw palette classes. `UNDEFINED` used `bg-zinc-400`,
 * which appears nowhere else in the app's token set.
 */
export const TIER_DOT: Record<string, string> = {
  NON_NEGOTIABLE: 'bg-rose-500',
  GROWTH: 'bg-emerald-500',
  LIFESTYLE: 'bg-amber-500',
  FLEXIBLE: 'bg-violet-500',
  ALTERNATIVE: 'bg-teal-500',
  BONUS: 'bg-sky-500',
  OPTIONAL: 'bg-zinc-400',
  EXPERIMENTAL: 'bg-zinc-300',
  SPECIAL: 'bg-pink-500',
  JUST_FOR_FUN: 'bg-fuchsia-500',
  UNDEFINED: 'bg-zinc-500',
};

// ---------------------------------------------------------------------------
// Heatmap ramp
// ---------------------------------------------------------------------------

/**
 * Five shades, level 0-4. Extracted because the ramp was inline in
 * `ContributionHeatmap` and level 0 (`bg-muted`) is deliberately *the same
 * colour as an absent day* — which is why the heatmap needs a real empty state
 * rather than relying on the grid to say something.
 */
export const HEAT_RAMP = [
  'bg-muted',
  'bg-emerald-500/25',
  'bg-emerald-500/45',
  'bg-emerald-500/70',
  'bg-emerald-500',
] as const;

/**
 * Score -> level.
 *
 * THE RULE: **any day with a score above zero is a day the user worked**, and it
 * gets at least level 1 so it glows. Only `null` (no score was ever stored) and
 * an exact `0` stay at level 0.
 *
 * The previous version put the level-1 threshold at `>= 25`, which meant a score
 * of 1–24 rendered in the *level 0 wash* — visually identical to a day with no
 * data at all. Since `DailyScore.totalScore` is a weighted composite, ticking
 * one habit out of twelve lands around 8, so the single most common kind of
 * active day was drawn as blank. The card read as broken rather than as quiet.
 * Level 0 has to mean "nothing happened", not "not very much happened".
 *
 * `null` stays distinct from `0`: no stored score is an absence of data, not a
 * measurement of zero.
 */
export function heatLevel(score: number | null): 0 | 1 | 2 | 3 | 4 {
  if (score === null) return 0;
  if (score === 0) return 0;
  if (score >= 90) return 4;
  if (score >= 75) return 3;
  if (score >= 50) return 2;
  // Everything from 1 to 49: worked, but not strongly.
  return 1;
}

/**
 * B2: "cells aren't flat squares - each is a tiny rounded tile with its own
 * micro-gradient based on score level, so the whole grid has a subtle jewel-like
 * texture rather than looking like a spreadsheet."
 *
 * Separate from `HEAT_RAMP` because that is a set of Tailwind *classes* and this
 * needs inline `background` values to carry a gradient. Level 0 is kept visibly
 * distinct from level 1 here: the ramp already makes level 0 the same colour as
 * an absent day, and a gradient must not quietly promote it to "scored a little".
 */
export const HEAT_FILL: readonly string[] = [
  /*
    Level 0 is built from `--muted-foreground`, NOT from `--muted`.

    In dark mode `--muted` and `--border` are both `#27272a`, which is within a
    couple of percent of the card background - so a level-0 cell rendered as an
    invisible block and the grid looked like it had holes in it. The brief's
    requirement is "inactive is never invisible"; a floor derived from the same
    token as the surface cannot satisfy that. A mid-tone at low alpha is
    measurably off the background in both themes from one declaration.
  */
  'linear-gradient(135deg, color-mix(in srgb, var(--muted-foreground) 18%, transparent), color-mix(in srgb, var(--muted-foreground) 11%, transparent))',
  'linear-gradient(135deg, rgb(var(--heat-green) / 0.34), rgb(var(--heat-green) / 0.18))',
  'linear-gradient(135deg, rgb(var(--heat-green) / 0.54), rgb(var(--heat-green) / 0.30))',
  'linear-gradient(135deg, rgb(var(--heat-green) / 0.76), rgb(var(--heat-green) / 0.50))',
  'linear-gradient(135deg, rgb(var(--heat-green-hi) / 0.95), rgb(var(--heat-green) / 0.70))',
] as const;

/**
 * The halo on a cell the user actually worked.
 *
 * A fill alone does not read as "glowing" — it reads as a coloured square. What
 * makes a day feel lit from inside is a little light spilling past its own edge,
 * which is why this exists as a separate token rather than being baked into
 * `HEAT_FILL`.
 *
 * Tuned per theme alongside `--heat-green`, because a dark halo on a dark card is
 * an absence of light rather than light: dark mode's `--heat-glow` is the
 * *brighter* emerald even though its base green is lighter too.
 *
 * `HEAT_GLOW[0]` is the string `"none"` rather than an empty value so a cell can
 * spread it unconditionally without branching, and so level 0 cannot accidentally
 * inherit a halo.
 */
export const HEAT_GLOW: readonly string[] = [
  'none',
  '0 0 3px 0 rgb(var(--heat-glow) / 0.45)',
  '0 0 4px 0 rgb(var(--heat-glow) / 0.55)',
  '0 0 5px 0 rgb(var(--heat-glow) / 0.65)',
  '0 0 7px 0 rgb(var(--heat-glow) / 0.75)',
] as const;

/**
 * The fill + halo for one level, as a single `box-shadow` value.
 *
 * Composed in code rather than in CSS because both gradients and shadows are
 * inline styles on the same element, and `box-shadow` is the only one of the two
 * that can hold the inset edge the cells use for structure. Keeping the three
 * parts in one helper means a cell cannot get a green fill with a stale halo, or
 * a halo on a level-0 wash.
 */
export function heatBoxShadow(level: number, edge: string): string {
  const inset = `inset 0 0 0 1px ${edge}`;
  const glow = HEAT_GLOW[level];
  // **Glow first, hairline second.** In a `box-shadow` list the first entry paints
  // on top, so the hairline has to be LAST or it sits over the halo and flattens
  // it back into a plain coloured square — which is the thing this glow exists to
  // avoid. This was originally written the other way round, pinned by a comment
  // that described the correct order while the code did the opposite.
  return glow === 'none' ? inset : `${glow}, ${inset}`;
}

/**
 * The hairline every heatmap cell carries.
 *
 * Separate from `HEAT_FILL` because a cell needs an *edge* as well as a *fill*:
 * at level 0 the fill alone is a soft wash, and the edge is what makes the
 * calendar's structure legible. Same muted-foreground reasoning as above.
 *
 * The edge does the real work on a sparse year. With one active day out of 274,
 * ~99.6% of the grid is level 0, so "can I see the calendar" is decided almost
 * entirely by these two values rather than by the ramp - which is why they are
 * tuned for the dim case and the greens are allowed to be much brighter.
 */
export const HEAT_EDGE = 'color-mix(in srgb, var(--muted-foreground) 26%, transparent)';

// ---------------------------------------------------------------------------
// Goal priority
// ---------------------------------------------------------------------------

/**
 * Severity ramp. `CRITICAL` and `HIGH` were both mapped to a green `success`
 * variant, so the two most urgent priorities were visually identical and both
 * read as "good" (ERROR.md B.1). The `danger` variant existed in `Badge.tsx`
 * the whole time, unused.
 */
export const PRIORITY_TONE: Record<string, StatusKey | 'primary' | 'default'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'default',
  LOW: 'default',
  PERSONAL: 'primary',
  ACADEMIC: 'primary',
  PROFESSIONAL: 'primary',
  NON_PROFIT: 'default',
};

// ---------------------------------------------------------------------------
// Corners, elevation, motion
// ---------------------------------------------------------------------------

/**
 * "20px on primary cards, 14px on nested elements — one consistent scale."
 * Tailwind's `rounded-2xl` is 16px, which is neither, so the scale is explicit.
 */
export const RADIUS = {
  card: '1.25rem', // 20px
  nested: '0.875rem', // 14px
  pill: '9999px',
} as const;

export const ELEVATION = {
  flat: 'shadow-flat',
  raised: 'shadow-raised',
  floating: 'shadow-floating',
} as const;

/** "200–350ms, cubic-bezier(0.16,1,0.3,1)" — one duration scale, not ad-hoc. */
export const MOTION = {
  fast: 'duration-200',
  base: 'duration-300',
  slow: 'duration-500',
  ease: 'ease-out-expo',
} as const;

// ---------------------------------------------------------------------------
// Repeated copy
// ---------------------------------------------------------------------------

/**
 * Empty-state strings that were duplicated across widgets, and which the spec
 * requires share a tone: "encouraging, never apologetic".
 */
export const EMPTY_COPY = {
  noData: 'Nothing here yet',
  noDataHint: 'Complete a habit or a routine block and this will fill in.',
  failed: 'This did not load',
  failedHint: 'This is a failed request, not an empty history.',
} as const;
