import type { Prisma, Quote } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Quote Repository
 * Database operations for the `Quote` model.
 */
export class QuoteRepository extends BaseRepository {
  /**
   * Quotes visible to a user: public ones plus their own.
   */
  async findVisible(userId: UserId): Promise<Quote[]> {
    try {
      return await this.prisma.quote.findMany({
        where: { OR: [{ isPublic: true }, { userId }] },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findVisible');
    }
  }

  /**
   * Quotes in the random pool: either only the user's own, or public + own.
   */
  async findPool(
    userId: UserId,
    scope: 'all' | 'mine'
  ): Promise<Pick<Quote, 'id' | 'text' | 'author'>[]> {
    try {
      return await this.prisma.quote.findMany({
        where: scope === 'mine' ? { userId } : { OR: [{ userId }, { isPublic: true }] },
        select: { id: true, text: true, author: true },
      });
    } catch (error) {
      this.handleError(error, 'findPool');
    }
  }

  /**
   * Find a quote by id, unscoped — callers must verify ownership.
   */
  async findById(quoteId: string): Promise<Quote | null> {
    try {
      return await this.prisma.quote.findUnique({ where: { id: quoteId } });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Create a quote.
   */
  async create(data: Prisma.QuoteCreateInput): Promise<Quote> {
    try {
      return await this.prisma.quote.create({ data });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Update a quote.
   */
  async update(quoteId: string, data: Prisma.QuoteUpdateInput): Promise<Quote> {
    try {
      return await this.prisma.quote.update({ where: { id: quoteId }, data });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a quote.
   */
  async delete(quoteId: string): Promise<Quote> {
    try {
      return await this.prisma.quote.delete({ where: { id: quoteId } });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}

export const quoteRepository = new QuoteRepository();
