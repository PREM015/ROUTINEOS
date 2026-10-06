/**
 * Journal policy — limits and conditions that must be readable without a
 * database.
 *
 * These lived in `journal.repository.ts`, which reaches `@/lib/prisma` through
 * its base class and therefore throws on import without `DATABASE_URL`. That put
 * a numeric ceiling and an error class out of reach of any test, and forced a
 * service test to `importActual` the repository just to name its own error type —
 * which loads Prisma and fails. Keeping them here means both the service and a
 * Vitest `node` run can import them directly.
 */

/**
 * Ceiling on a single export.
 *
 * `findAllForExport` is the only unbounded read in the repository, so it needs a
 * floor under it: a decade of daily entries is already a multi-megabyte Markdown
 * document, and without a cap the request either exhausts memory or streams a
 * response too large to finish.
 */
export const EXPORT_MAX_ENTRIES = 2000;

/**
 * Newest revisions returned for one entry.
 *
 * History is unbounded in the schema, so an entry edited hundreds of times would
 * otherwise send hundreds of full copies of its content to open a dialog.
 */
export const MAX_REVISIONS_PER_ENTRY = 50;

/**
 * Raised when a tag batch names ids the caller does not own.
 *
 * A dedicated type rather than a generic `Error` because the service has to map
 * this to 403 while every other repository failure maps to 500 or 400. The
 * repository stays free of HTTP concerns; it names the condition and the
 * service decides what it means.
 *
 * `JournalEntryTag` carries no `userId`, so the database cannot enforce this
 * ownership rule itself — which is why it is checked on the write path rather
 * than trusted.
 */
export class ForeignTagError extends Error {
  readonly tagIds: readonly string[];

  constructor(tagIds: readonly string[]) {
    super('One or more tags do not belong to this user');
    this.name = 'ForeignTagError';
    this.tagIds = tagIds;
  }
}
