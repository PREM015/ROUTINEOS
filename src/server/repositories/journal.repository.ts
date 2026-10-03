import type { JournalEntry, JournalRevision, Prisma } from '@/generated/prisma';
import { NotFoundError } from '@/lib/errors/app-error';
import { BaseRepository } from './base.repository';

/**
 * Journal Repository
 * Database operations for JournalEntry and JournalEntryTag models
 *
 * This is the only layer that touches the database. Decisions that are not
 * about storage — who owns a tag, what a PATCH `null` means, how a conflicting
 * date is reported — live in `JournalService`.
 */

export type JournalSortField = 'date' | 'createdAt' | 'title' | 'mood';
export type JournalSortOrder = 'asc' | 'desc';

export interface CreateJournalData {
  date: string;
  title?: string;
  content: string;
  mood?: number;
  energy?: number;
  gratitude?: string;
  isFavorite?: boolean;
  tagIds?: string[];
}

export interface JournalQueryParams {
  from?: string;
  to?: string;
  search?: string;
  mood?: number;
  tagIds?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  sortBy?: JournalSortField;
  sortOrder?: JournalSortOrder;
  limit?: number;
  offset?: number;
}

export interface JournalTrashQueryParams {
  limit?: number;
  offset?: number;
}

/** Mood/energy for one day, for the calendar's month view. */
export interface JournalMonthCell {
  date: string;
  mood: number | null;
  entryId: string;
  isFavorite: boolean;
}

/**
 * Ceiling on a single export.
 *
 * `findAllForExport` is the only unbounded read in this repository, so it needs
 * a floor under it: a decade of daily entries is already a multi-megabyte
 * Markdown document, and without a cap the request either exhausts memory or
 * streams a response too large to finish.
 */
export const EXPORT_MAX_ENTRIES = 2000;

/**
 * Newest revisions returned for one entry.
 *
 * The history dialog shows the most recent slice; older revisions remain in the
 * database and the oldest are the least interesting, since the current content
 * is one of them.
 */
export const MAX_REVISIONS_PER_ENTRY = 50;

/**
 * Raised when a tag batch names ids the caller does not own.
 *
 * A dedicated type rather than a generic `Error` because the service has to map
 * this to a 403, while every other repository failure maps to 500 or 400. The
 * repository stays free of HTTP concerns; it names the condition and the
 * service decides what it means.
 */
export class ForeignTagError extends Error {
  readonly tagIds: readonly string[];

  constructor(tagIds: readonly string[]) {
    super('One or more tags do not belong to this user');
    this.name = 'ForeignTagError';
    this.tagIds = tagIds;
  }
}

const ENTRY_WITH_TAGS = {
  tags: { include: { tag: true } },
} satisfies Prisma.JournalEntryInclude;

/**
 * Which column a sort field maps to, and what nulls mean for it.
 *
 * `title` and `mood` are nullable, so a plain `orderBy` leaves their ordering
 * up to the database: Postgres puts nulls last for `asc` and *first* for
 * `desc`, which meant "title A–Z" listed untitled entries above the titled ones.
 * Explicit `nulls` pins that down so both directions put unnamed entries last,
 * where an unnamed entry belongs.
 *
 * `satisfies` with no type annotation: an annotation would widen `'desc'` to
 * `string`, which Prisma's `SortOrder` rejects.
 */
const SORT_FIELDS = {
  date: { date: { sort: 'desc', nulls: 'last' } },
  createdAt: { createdAt: { sort: 'desc', nulls: 'last' } },
  title: { title: { sort: 'asc', nulls: 'last' } },
  mood: { mood: { sort: 'desc', nulls: 'last' } },
} satisfies Record<JournalSortField, Prisma.JournalEntryOrderByWithRelationInput>;

function buildOrderBy(
  sortBy: JournalSortField | undefined,
  sortOrder: JournalSortOrder | undefined
): Prisma.JournalEntryOrderByWithRelationInput[] {
  const field = SORT_FIELDS[sortBy ?? 'date'] ?? SORT_FIELDS.date;
  const order = sortOrder ?? 'desc';

  return [
    // `date` is unique per user, so it is also the tiebreaker: without it, two
    // entries written in the same millisecond could swap places between pages
    // and one of them would never be reachable at any page size.
    { date: order === 'asc' ? 'asc' : 'desc' },
    { ...field },
  ];
}

export class JournalRepository extends BaseRepository {
  /**
   * Create a journal entry. Tags are attached separately by `setTags`, not
   * nested here, so create and update share one ownership-checked code path —
   * see the note on `setTags`.
   */
  async create(userId: string, data: CreateJournalData): Promise<JournalEntry> {
    try {
      return await this.prisma.journalEntry.create({
        data: {
          date: data.date,
          title: data.title,
          content: data.content,
          mood: data.mood,
          energy: data.energy,
          gratitude: data.gratitude,
          isFavorite: data.isFavorite,
          user: { connect: { id: userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find a journal entry by ID with tags.
   * Soft-deleted entries are hidden unless `includeDeleted` is set.
   */
  async findById(userId: string, entryId: string, includeDeleted = false) {
    try {
      return await this.prisma.journalEntry.findFirst({
        where: {
          id: entryId,
          userId,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
        include: ENTRY_WITH_TAGS,
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Find a journal entry by date for a user.
   * Soft-deleted entries are excluded.
   */
  async findByDate(
    userId: string,
    date: string
  ): Promise<JournalEntry | null> {
    try {
      const entry = await this.prisma.journalEntry.findUnique({
        where: { userId_date: { userId, date } },
      });
      if (!entry || entry.deletedAt !== null) return null;
      return entry;
    } catch (error) {
      this.handleError(error, 'findByDate');
    }
  }

  /**
   * Find a journal entry by date, including one that is in the trash.
   *
   * Separate from `findByDate` because restoring an entry for a day that was
   * deleted has to see the deleted row, or it would look free and fail on the
   * `@@unique([userId, date])` constraint instead.
   */
  async findByDateIncludingDeleted(
    userId: string,
    date: string
  ): Promise<JournalEntry | null> {
    try {
      return await this.prisma.journalEntry.findUnique({
        where: { userId_date: { userId, date } },
      });
    } catch (error) {
      this.handleError(error, 'findByDateIncludingDeleted');
    }
  }

  /**
   * Where clause shared by `findAll` and `countAll`, so a page and its total
   * can never be computed from different predicates.
   */
  private buildWhere(userId: string, query: JournalQueryParams): Prisma.JournalEntryWhereInput {
    const where: Prisma.JournalEntryWhereInput = {
      userId,
      deletedAt: null,
    };

    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = query.from;
      if (query.to) where.date.lte = query.to;
    }

    if (query.mood !== undefined) {
      where.mood = query.mood;
    }

    // These are columns on the entry, so they belong in the query rather than
    // in a filter applied to the page afterwards. They used to be applied in
    // `listJournalEntries` *after* the repository had already sliced the page,
    // which made "favorites" return whatever favorites happened to be in the
    // first 20 rows and report `total` as the size of that short list.
    if (query.isFavorite !== undefined) where.isFavorite = query.isFavorite;
    if (query.isArchived !== undefined) where.isArchived = query.isArchived;

    if (query.tagIds && query.tagIds.length > 0) {
      where.tags = { some: { tagId: { in: query.tagIds } } };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * Find journal entries for a user with optional filters, one page at a time.
   */
  async findAll(userId: string, query: JournalQueryParams = {}) {
    try {
      return await this.prisma.journalEntry.findMany({
        where: this.buildWhere(userId, query),
        include: ENTRY_WITH_TAGS,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Count everything matching the same filters as `findAll`.
   *
   * Exists because every route used to report `meta.total = entries.length`,
   * which is the size of the current page. A paginator built on that either
   * shows one page forever or invents pages that 404 on load.
   */
  async countAll(userId: string, query: JournalQueryParams = {}): Promise<number> {
    try {
      return await this.prisma.journalEntry.count({
        where: this.buildWhere(userId, query),
      });
    } catch (error) {
      this.handleError(error, 'countAll');
    }
  }

  /**
   * Every entry matching the filters, ignoring pagination.
   *
   * For export only. Bounded by `EXPORT_MAX_ENTRIES` because this is the one
   * query in the domain with no `take`, and an unbounded read is how a long
   * journal turns a download into an out-of-memory crash.
   */
  async findAllForExport(userId: string, query: JournalQueryParams = {}): Promise<JournalEntry[]> {
    try {
      return await this.prisma.journalEntry.findMany({
        where: this.buildWhere(userId, query),
        include: ENTRY_WITH_TAGS,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        take: query.limit ?? EXPORT_MAX_ENTRIES,
      });
    } catch (error) {
      this.handleError(error, 'findAllForExport');
    }
  }

  /**
   * Update a journal entry owned by the user
   */
  async update(
    userId: string,
    entryId: string,
    data: Prisma.JournalEntryUpdateInput
  ): Promise<JournalEntry> {
    try {
      return await this.prisma.journalEntry.update({
        where: { id: entryId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a journal entry owned by the user (hard delete).
   * Prefer `softDelete` unless the user explicitly purges the entry.
   */
  async delete(userId: string, entryId: string): Promise<JournalEntry> {
    try {
      return await this.prisma.journalEntry.delete({
        where: { id: entryId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * List soft-deleted journal entries (the trash), newest deletion first.
   */
  async findDeleted(userId: string, query: JournalTrashQueryParams = {}) {
    try {
      return await this.prisma.journalEntry.findMany({
        where: { userId, deletedAt: { not: null } },
        include: ENTRY_WITH_TAGS,
        orderBy: { deletedAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findDeleted');
    }
  }

  /**
   * How many entries are in the trash.
   *
   * Kept separate from `findDeleted` because the two are called independently
   * — the trash count labels the collapsed section, so it is needed whether or
   * not the list has been opened.
   */
  async countDeleted(userId: string): Promise<number> {
    try {
      return await this.prisma.journalEntry.count({
        where: { userId, deletedAt: { not: null } },
      });
    } catch (error) {
      this.handleError(error, 'countDeleted');
    }
  }

  /**
   * Soft delete a journal entry owned by the user (sets `deletedAt`).
   * The row and its revision history are preserved for restore.
   */
  async softDelete(userId: string, entryId: string): Promise<JournalEntry> {
    try {
      const existing = await this.prisma.journalEntry.findFirst({
        where: { id: entryId, userId },
      });
      if (!existing) {
        throw new NotFoundError('Journal entry');
      }
      return await this.prisma.journalEntry.update({
        where: { id: entryId },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      this.handleError(error, 'softDelete');
    }
  }

  /**
   * Restore a soft-deleted journal entry (clears `deletedAt`).
   */
  async restore(userId: string, entryId: string): Promise<JournalEntry> {
    try {
      const existing = await this.prisma.journalEntry.findFirst({
        where: { id: entryId, userId },
      });
      if (!existing) {
        throw new NotFoundError('Journal entry');
      }
      return await this.prisma.journalEntry.update({
        where: { id: entryId },
        data: { deletedAt: null },
      });
    } catch (error) {
      this.handleError(error, 'restore');
    }
  }

  /**
   * Permanently delete a journal entry owned by the user.
   * Revisions are removed via the `onDelete: Cascade` relation.
   */
  async permanentDelete(userId: string, entryId: string): Promise<JournalEntry> {
    try {
      const existing = await this.prisma.journalEntry.findFirst({
        where: { id: entryId, userId },
      });
      if (!existing) {
        throw new NotFoundError('Journal entry');
      }
      return await this.prisma.journalEntry.delete({
        where: { id: entryId },
      });
    } catch (error) {
      this.handleError(error, 'permanentDelete');
    }
  }

  /**
   * Snapshot the current title/content of an entry into a revision.
   * Call this BEFORE overwriting so history is never lost.
   */
  async createRevision(
    userId: string,
    entryId: string,
    title: string | null,
    content: string
  ): Promise<JournalRevision> {
    try {
      const existing = await this.prisma.journalEntry.findFirst({
        where: { id: entryId, userId },
      });
      if (!existing) {
        throw new NotFoundError('Journal entry');
      }
      return await this.prisma.journalRevision.create({
        data: { entryId, userId, title, content },
      });
    } catch (error) {
      this.handleError(error, 'createRevision');
    }
  }

  /**
   * List revisions of an entry owned by the user, newest first.
   *
   * Capped: history is unbounded in the schema, so an entry edited hundreds of
   * times would otherwise send hundreds of full copies of its content to open a
   * dialog.
   */
  async listRevisions(
    userId: string,
    entryId: string
  ): Promise<JournalRevision[]> {
    try {
      const existing = await this.prisma.journalEntry.findFirst({
        where: { id: entryId, userId },
      });
      if (!existing) {
        throw new NotFoundError('Journal entry');
      }
      return await this.prisma.journalRevision.findMany({
        where: { entryId, userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_REVISIONS_PER_ENTRY,
      });
    } catch (error) {
      this.handleError(error, 'listRevisions');
    }
  }

  /**
   * Restore a revision's title/content onto its entry.
   * The pre-restore content is snapshotted into a new revision first,
   * so restoring never destroys history.
   */
  async restoreRevision(
    userId: string,
    entryId: string,
    revisionId: string
  ): Promise<JournalEntry> {
    try {
      return await this.transaction(async (tx) => {
        const entry = await tx.journalEntry.findFirst({
          where: { id: entryId, userId },
        });
        if (!entry) {
          throw new NotFoundError('Journal entry');
        }
        const revision = await tx.journalRevision.findFirst({
          where: { id: revisionId, entryId, userId },
        });
        if (!revision) {
          throw new NotFoundError('Journal revision');
        }
        await tx.journalRevision.create({
          data: {
            entryId,
            userId,
            title: entry.title,
            content: entry.content,
          },
        });
        return await tx.journalEntry.update({
          where: { id: entryId },
          data: { title: revision.title, content: revision.content },
        });
      });
    } catch (error) {
      this.handleError(error, 'restoreRevision');
    }
  }

  /**
   * Replace the tags on a journal entry, rejecting any tag the user does not own.
   *
   * `JournalEntryTag` has no `userId` of its own — ownership comes only from the
   * parent entry — so nothing at the schema level stops a caller attaching one
   * user's `Tag.id` to another user's entry. That check is here rather than only
   * in the service because `setTags` is the single write path for tags on
   * journal entries, so the check belongs on the write.
   *
   * Throws before `deleteMany`, not after: the original code deleted the
   * existing tags and then inserted whatever it was given, so a rejected batch
   * left the entry with no tags at all.
   */
  async setTags(
    userId: string,
    entryId: string,
    tagIds: string[]
  ): Promise<number> {
    const uniqueTagIds = [...new Set(tagIds)];

    try {
      if (uniqueTagIds.length === 0) {
        await this.prisma.journalEntryTag.deleteMany({
          where: { entryId, entry: { userId } },
        });
        return 0;
      }

      return await this.transaction(async (tx) => {
        const owned = await tx.tag.findMany({
          where: { id: { in: uniqueTagIds }, userId },
          select: { id: true },
        });

        if (owned.length !== uniqueTagIds.length) {
          const found = new Set(owned.map((tag) => tag.id));
          const foreign = uniqueTagIds.filter((tagId) => !found.has(tagId));
          throw new ForeignTagError(foreign);
        }

        await tx.journalEntryTag.deleteMany({
          where: { entryId, entry: { userId } },
        });

        const result = await tx.journalEntryTag.createMany({
          data: uniqueTagIds.map((tagId) => ({ entryId, tagId })),
        });

        return result.count;
      });
    } catch (error) {
      this.handleError(error, 'setTags');
    }
  }

  /**
   * Tag ids owned by the user among those requested.
   *
   * For the service's pre-write check, so a create can fail before it has
   * written anything rather than after.
   */
  async findOwnedTagIds(userId: string, tagIds: string[]): Promise<string[]> {
    try {
      const owned = await this.prisma.tag.findMany({
        where: { id: { in: [...new Set(tagIds)] }, userId },
        select: { id: true },
      });
      return owned.map((tag) => tag.id);
    } catch (error) {
      this.handleError(error, 'findOwnedTagIds');
    }
  }

  /**
   * Per-day mood/energy for one month, for the calendar.
   *
   * A month holds at most 31 entries, so this is small and does not need
   * paging. It exists because the calendar used to derive its colours from
   * whatever the list had already loaded — capped at 100 entries — so a day in
   * the middle of a long month simply had no colour.
   */
  async findMonthCells(
    userId: string,
    from: string,
    to: string
  ): Promise<JournalMonthCell[]> {
    try {
      const entries = await this.prisma.journalEntry.findMany({
        where: { userId, deletedAt: null, date: { gte: from, lte: to } },
        select: { id: true, date: true, mood: true, energy: true, isFavorite: true },
        orderBy: { date: 'asc' },
      });

      return entries.map((entry) => ({
        date: entry.date,
        mood: entry.mood,
        entryId: entry.id,
        isFavorite: entry.isFavorite,
      }));
    } catch (error) {
      this.handleError(error, 'findMonthCells');
    }
  }

  /**
   * Count journal entries in a given month
   */
  async countByMonth(
    userId: string,
    year: number,
    month: number
  ): Promise<number> {
    try {
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

      return await this.prisma.journalEntry.count({
        where: {
          userId,
          deletedAt: null,
          date: { startsWith: monthPrefix },
        },
      });
    } catch (error) {
      this.handleError(error, 'countByMonth');
    }
  }

  /**
   * Count every non-deleted entry whose `date` falls inside an inclusive range.
   *
   * The range form of `countByMonth`. `yearlySummary` used to call `countByMonth`
   * twelve times in a sequential `for` loop, which is twelve dependent round trips
   * where one predicate expresses the same thing — and it is the widest of the
   * three count shapes, so the year tab paid for it most visibly.
   *
   * `date` is a `YYYY-MM-DD` string column, so a plain `gte`/`lte` is an indexable
   * range scan. `startsWith` (what `countByMonth` used) cannot use that index.
   */
  async countByRange(userId: string, startDate: string, endDate: string): Promise<number> {
    try {
      return await this.prisma.journalEntry.count({
        where: {
          userId,
          deletedAt: null,
          date: { gte: startDate, lte: endDate },
        },
      });
    } catch (error) {
      this.handleError(error, 'countByRange');
    }
  }

  /**
   * Get distinct journal dates for streak calculation
   */
  async getStreakData(userId: string): Promise<string[]> {
    try {
      const dates = await this.prisma.journalEntry.findMany({
        where: { userId, deletedAt: null },
        select: { date: true },
        orderBy: { date: 'asc' },
        distinct: ['date'],
      });

      return dates.map((entry) => entry.date);
    } catch (error) {
      this.handleError(error, 'getStreakData');
    }
  }

  /**
   * Search journal entries by term
   */
  async search(
    userId: string,
    term: string,
    limit?: number
  ): Promise<JournalEntry[]> {
    try {
      return await this.prisma.journalEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            {
              title: {
                contains: term,
                mode: 'insensitive',
              },
            },
            {
              content: {
                contains: term,
                mode: 'insensitive',
              },
            },
          ],
        },
        include: {
          tags: {
            include: { tag: true },
          },
        },
        orderBy: { date: 'desc' },
        ...this.buildPaginationQuery(limit),
      });
    } catch (error) {
      this.handleError(error, 'search');
    }
  }
}
