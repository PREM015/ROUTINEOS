import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';

/**
 * Base Repository
 * Common database operations and utilities
 */

export abstract class BaseRepository {
  protected prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Execute operation in transaction
   */
  protected async transaction<T>(
    callback: (tx: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  /**
   * Check if record exists
   */
  protected async exists(
    model: keyof PrismaClient,
    where: Record<string, unknown>
  ): Promise<boolean> {
    const count = await (this.prisma[model] as any).count({ where });
    return count > 0;
  }

  /**
   * Verify ownership of a record
   */
  protected async verifyOwnership(
    model: keyof PrismaClient,
    recordId: string,
    userId: string
  ): Promise<boolean> {
    const record = await (this.prisma[model] as any).findUnique({
      where: { id: recordId },
      select: { userId: true },
    });

    return record?.userId === userId;
  }

  /**
   * Build pagination query
   */
  protected buildPaginationQuery(
    limit?: number,
    offset?: number
  ): { take?: number; skip?: number } {
    const query: { take?: number; skip?: number } = {};

    if (limit !== undefined && limit > 0) {
      query.take = Math.min(limit, 100); // Max 100 items
    }

    if (offset !== undefined && offset > 0) {
      query.skip = offset;
    }

    return query;
  }

  /**
   * Build ordering query
   */
  protected buildOrderQuery(
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Record<string, 'asc' | 'desc'> | undefined {
    if (!sortBy) return undefined;

    return { [sortBy]: sortOrder };
  }

  /**
   * Handle Prisma errors
   */
  protected handleError(error: unknown, operation: string): never {
    console.error(`Repository error in ${operation}:`, error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`Unknown error in ${operation}`);
  }
}