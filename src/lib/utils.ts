import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to readable string
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time to HH:mm
 */
export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

/**
 * Get relative time string
 */
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

/**
 * Sleep duration for display
 */
export function formatSleepDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Percentage to color
 */
export function getPercentageColor(percentage: number): string {
  if (percentage >= 90) return 'text-green-600';
  if (percentage >= 70) return 'text-blue-600';
  if (percentage >= 50) return 'text-yellow-600';
  if (percentage >= 30) return 'text-orange-600';
  return 'text-red-600';
}

// ============================================================================
// User-chosen accent colours
// ============================================================================

/**
 * Style for a chip or badge tinted by a colour the *user* picked (a tag, an
 * achievement rarity, a habit colour, a focus mode).
 *
 * The recurring bug this exists to prevent: a user-chosen hex is a **mid-tone**
 * colour chosen to read as a swatch, and the failure is always the same — it
 * gets used directly as a `color` on text, where it fails WCAG AA on a light
 * background while looking fine on a dark one. Concretely, against a white card:
 *
 *   `#22c55e` 2.3:1    `#3b82f6` 3.7:1
 *   `#f59e0b` 2.2:1    `#8b5cf6` 4.2:1
 *
 * Mixing the hue toward `var(--foreground)` fixes it without a second
 * hand-tuned palette: `--foreground` is near-black in light mode (so the result
 * is a *darker* hue) and near-white in dark mode (so it is a *lighter* hue), and
 * one declaration is legible in both. The background mixes toward `--card` for
 * the same reason.
 *
 * Do **not** append an `1a`-style alpha to a user hex to get a tint — that
 * suffix is only defined against the light background it was tuned on, and
 * produces a near-invisible chip in dark mode.
 */
export function accentChipStyle(accent: string): {
  backgroundColor: string;
  color: string;
} {
  return {
    backgroundColor: `color-mix(in oklab, ${accent} 16%, var(--card))`,
    color: `color-mix(in oklab, ${accent} 72%, var(--foreground))`,
  };
}

/**
 * A user accent as a border, ring or track — anywhere no text contrast is
 * involved, so the raw hue is kept.
 */
export function accentTint(accent: string): string {
  return `color-mix(in oklab, ${accent} 45%, transparent)`;
}

/**
 * A solid fill from a user accent, dark enough that **white text on it clears
 * WCAG AA** (4.5:1).
 *
 * For buttons and tabs, where the label sits on the colour rather than beside
 * it. Using the raw hue here is what made the Focus page's active tab
 * unreadable: `text-white` on `#22c55e` is 2.2:1 and on `#f59e0b` is 2.1:1.
 * Pulling 30% toward near-black lifts every mid-tone to roughly 5:1 or better
 * while keeping the hue recognisable.
 *
 * Deliberately theme-independent: a filled control should look the same in both
 * themes, so it is mixed toward a literal `#0a0a0a` rather than a token.
 */
export function accentFill(accent: string): string {
  return `color-mix(in oklab, ${accent} 70%, #0a0a0a)`;
}