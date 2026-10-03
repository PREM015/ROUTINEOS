/**
 * Day-type slug normalisation.
 *
 * ## Why this is its own module
 *
 * `DayTypeService` owned `normalizeDayTypeSlug`, which is pure and has no
 * business importing anything. But that service file also imports
 * `RoutineRepository` -> `BaseRepository` -> `@/lib/prisma`, and that chain
 * **throws at import time** when `DATABASE_URL` is absent. So a client component
 * that wanted to show a user the slug their day type would be given would have
 * had to either import a module that throws, or reimplement the rule — and a
 * reimplemented rule is how "Work Day" and "work-day" came to be two different
 * day types in the first place.
 *
 * Same split as `lib/scheduling/day-type.ts`: the pure rule lives here with no
 * imports, and the service imports *this*, not the other way round.
 */

/**
 * Normalise a user-entered slug: trim, lowercase, collapse spaces and
 * underscores to hyphens, strip anything that is not a valid slug character,
 * collapse and trim hyphens.
 *
 * Without this, "Work Day" and "work-day" are two different day types to the
 * `userId_slug` unique index, and `slugToDayType`'s canonical-slug lookup misses
 * both.
 */
export function normalizeDayTypeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The slug a new day type will be stored under.
 *
 * Displayed next to the name field so the user can see the identifier the
 * uniqueness constraint is actually enforced on, rather than discovering a
 * collision only after submitting.
 */
export function previewDayTypeSlug(name: string): string {
  return normalizeDayTypeSlug(name);
}