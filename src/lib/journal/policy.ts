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

export { ForeignTagError } from '@/lib/errors/app-error';

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