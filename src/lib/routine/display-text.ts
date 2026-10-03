/**
 * Display normalisation for user-authored routine text.
 *
 * ## Why this lives here and not in a component
 *
 * Every surface that renders a block title hit the same problem independently:
 * `College /`, `DSA -`, `Gym ,`. A title is typed once and then displayed by the
 * timeline card, the now/next card, the completion sheet, the day-type editor
 * and the delete confirmation. Trimming in one place fixes all of them at once
 * and keeps them from drifting apart again.
 *
 * ## Display only — the stored value is never touched
 *
 * The editor shows and saves exactly what the user typed. Silently rewriting
 * someone's data on a read path is how you lose their trust in an app: the value
 * they see in the editor would not be the value that got saved, and they would
 * have no way to find out which one the app holds. Trimming a *copy* for display
 * loses nothing and hides nothing.
 *
 * So callers that need the original keep it — the `title` attribute on hover
 * still shows the real string, and `BlockEditor` never calls this at all.
 *
 * ## Why trailing punctuation specifically
 *
 * These are characters a person leaves behind while renaming, usually because
 * they typed a separator intending to add a suffix and did not. Leading
 * whitespace is trimmed because a card's text starts flush to its own padding and
 * a leading space is always accidental. Interior punctuation is left completely
 * alone: "College / AI", "3 -> 5", "read - later" are all legitimate titles and
 * none of them are touched.
 */

/** Trailing separators and whitespace a rename leaves behind. */
const TRAILING_NOISE = /[\s/\\|,;:.\-–—_]+$/u;

/**
 * A title fit to display.
 *
 * Returns the original string when trimming would empty it, so a title consisting
 * entirely of punctuation still renders as something rather than as a blank card.
 */
export function displayTitle(title: string): string {
  const trimmed = title.replace(TRAILING_NOISE, '').replace(/^\s+/u, '');
  return trimmed.length > 0 ? trimmed : title;
}

/**
 * Truncate for a single line, on a word boundary where possible.
 *
 * Purely visual — the full string is always available to assistive technology via
 * the `title` attribute the caller sets. The ellipsis is added by the caller's CSS
 * (`truncate`), so this returns the *candidate* text and the browser decides where
 * to cut. Kept here so every surface truncates at the same kind of boundary.
 */
export function shortTitle(title: string, maxChars = 42): string {
  const display = displayTitle(title);
  if (display.length <= maxChars) return display;
  const slice = display.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  // Only honour a word boundary if it is not chopping off most of the title —
  // otherwise "Deep work on the DSA" becomes "Deep work on the" for no reason.
  const cut = lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}`;
}
