import type { JournalEntry, JournalRevision, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Journal Repository
 * Database operations for JournalEntry and JournalEntryTag models
 */

interface CreateJournalData {
  date: string;
  title?: string;
  content: string;
  mood?: number;
  energy?: number;
  gratitude?: string;
  isFavorite?: boolean;
  tagIds?: string[];
}

interface JournalQueryParams {
  from?: string;
  to?: string;
  search?: string;
  mood?: number;
  tagIds?: string[];
  limit?: number;
  offset?: number;
}

interface JournalTrashQueryParams {
  limit?: number;
  offset?: number;
}

export class JournalRepository extends BaseRepository {
  /**
   * Create a journal entry with optional tags
   */
  async create(userId: string, data: CreateJournalData): Promise<JournalEntry> {
    try {
      const tagIds = data.tagIds ?? [];

      return await this.prisma.journalEntry.create({
        data: {
          date: data.date,
          title: data.title,
          content: data.content,
          mood: data.mood,
          energy: data.energy,
          gratitude: data.gratitude,
          isFavorite: data.isFavorite,
          tags:
            tagIds.length > 0
              ? { createMany: { data: tagIds.map((tagId) => ({ tagId })) } }
              : undefined,
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
        include: {
          tags: {
            include: { tag: true },
          },
        },
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
   * Find journal entries for a user with optional filters
   */
  async findAll(userId: string, query: JournalQueryParams = {}) {
    try {
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

      if (query.tagIds && query.tagIds.length > 0) {
        where.tags = { some: { tagId: { in: query.tagIds } } };
      }

      if (query.search) {
        where.OR = [
          {
            title: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            content: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ];
      }

      return await this.prisma.journalEntry.findMany({
        where,
        include: {
          tags: {
            include: { tag: true },
          },
          _count: {
            select: { tags: true },
          },
        },
        orderBy: { date: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
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
        include: {
          tags: {
            include: { tag: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findDeleted');
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
        throw new Error('Journal entry not found');
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
        throw new Error('Journal entry not found');
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
        throw new Error('Journal entry not found');
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
        throw new Error('Journal entry not found');
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
        throw new Error('Journal entry not found');
      }
      return await this.prisma.journalRevision.findMany({
        where: { entryId, userId },
        orderBy: { createdAt: 'desc' },
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
          throw new Error('Journal entry not found');
        }
        const revision = await tx.journalRevision.findFirst({
          where: { id: revisionId, entryId, userId },
        });
        if (!revision) {
          throw new Error('Journal revision not found');
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
   * Replace the tags on a journal entry
   */
  async setTags(
    userId: string,
    entryId: string,
    tagIds: string[]
  ): Promise<number> {
    try {
      return await this.transaction(async (tx) => {
        await tx.journalEntryTag.deleteMany({
          where: { entryId, entry: { userId } },
        });

        const result = await tx.journalEntryTag.createMany({
          data: tagIds.map((tagId) => ({ entryId, tagId })),
        });

        return result.count;
      });
    } catch (error) {
      this.handleError(error, 'setTags');
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