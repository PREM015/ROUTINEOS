import type { JournalEntry, Prisma } from '@prisma/client';
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
   * Find a journal entry by ID with tags
   */
  async findById(userId: string, entryId: string) {
    try {
      return await this.prisma.journalEntry.findFirst({
        where: { id: entryId, userId },
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
   * Find a journal entry by date for a user
   */
  async findByDate(
    userId: string,
    date: string
  ): Promise<JournalEntry | null> {
    try {
      return await this.prisma.journalEntry.findUnique({
        where: { userId_date: { userId, date } },
      });
    } catch (error) {
      this.handleError(error, 'findByDate');
    }
  }

  /**
   * Find journal entries for a user with optional filters
   */
  async findAll(userId: string, query: JournalQueryParams = {}) {
    try {
      const where: Prisma.JournalEntryWhereInput = { userId };

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
   * Delete a journal entry owned by the user
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
        where: { userId },
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