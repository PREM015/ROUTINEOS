/**
 * Domain accents.
 *
 * The spec: "Each domain gets one hue, used consistently everywhere". These map a
 * domain name to the CSS custom properties defined in `globals.css`, so a widget
 * picks its colour by declaring what it *is* rather than by hardcoding a hex at
 * every call site — which is how the codebase ended up with `text-emerald-400` in
 * one place and `text-emerald-500` in another for the same concept.
 *
 * Each domain also gets a `tint` (a very low-alpha wash of the same hue) used
 * behind the icon, and a `ring` (a mid-alpha version) used for chart strokes.
 * Both are expressed with `color-mix` against the accent so there is exactly one
 * place a hue is defined.
 */
export const DOMAIN_ACCENT = {
  score: { hue: 'var(--accent-score)', label: 'Score' },
  habits: { hue: 'var(--accent-habits)', label: 'Habits' },
  goals: { hue: 'var(--accent-goals)', label: 'Goals' },
  sleep: { hue: 'var(--accent-sleep)', label: 'Sleep' },
  routine: { hue: 'var(--accent-routine)', label: 'Routine' },
  focus: { hue: 'var(--accent-focus)', label: 'Focus' },
  streak: { hue: 'var(--accent-streak)', label: 'Streak' },
  insights: { hue: 'var(--accent-insights)', label: 'Insights' },
} as const;

export type Domain = keyof typeof DOMAIN_ACCENT;

/** 8% wash of the domain hue, for icon chips and backgrounds. */
export function accentTint(hue: string, percent = 8): string {
  return `color-mix(in oklab, ${hue} ${percent}%, transparent)`;
}

/** Mid-alpha version, for chart strokes and progress arcs. */
export function accentRing(hue: string, percent = 45): string {
  return `color-mix(in oklab, ${hue} ${percent}%, transparent)`;
}
