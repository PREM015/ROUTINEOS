import type { APIKey, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * API Key Repository
 * Database operations for the APIKey model.
 * Keys are scoped to a single user and identified by their hashed value.
 */

export class ApiKeyRepository extends BaseRepository {
  /**
   * Create a new API key record
   */
  async create(data: Prisma.APIKeyCreateInput): Promise<APIKey> {
    try {
      return await this.prisma.aPIKey.create({ data });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * List all API keys for a user, ordered by creation date descending
   */
  async findAllByUser(userId: string): Promise<APIKey[]> {
    try {
      return await this.prisma.aPIKey.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findAllByUser');
    }
  }

  /**
   * Find an API key by ID, scoped to a specific user (ownership check)
   */
  async findByIdScoped(id: string, userId: string): Promise<APIKey | null> {
    try {
      const key = await this.prisma.aPIKey.findUnique({ where: { id } });
      if (!key || key.userId !== userId) {
        return null;
      }
      return key;
    } catch (error) {
      this.handleError(error, 'findByIdScoped');
    }
  }

  /**
   * Update an API key (scoped to user)
   */
  async update(
    id: string,
    userId: string,
    data: Prisma.APIKeyUpdateInput
  ): Promise<APIKey> {
    try {
      const existing = await this.findByIdScoped(id, userId);
      if (!existing) {
        throw new Error('API key not found');
      }
      return await this.prisma.aPIKey.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Soft-delete an API key by setting isActive = false (revoke)
   */
  async revoke(id: string, userId: string): Promise<APIKey> {
    try {
      const existing = await this.findByIdScoped(id, userId);
      if (!existing) {
        throw new Error('API key not found');
      }
      return await this.prisma.aPIKey.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      this.handleError(error, 'revoke');
    }
  }

  /**
   * Permanently delete an API key (scoped to user)
   */
  async deleteById(id: string, userId: string): Promise<{ success: boolean }> {
    try {
      const existing = await this.findByIdScoped(id, userId);
      if (!existing) {
        throw new Error('API key not found');
      }
      await this.prisma.aPIKey.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      this.handleError(error, 'deleteById');
    }
  }

  /**
   * Count API keys for a user
   */
  async countByUser(userId: string): Promise<number> {
    try {
      return await this.prisma.aPIKey.count({ where: { userId } });
    } catch (error) {
      this.handleError(error, 'countByUser');
    }
  }
}
