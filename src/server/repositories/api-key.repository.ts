import type { APIKey, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

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
  async findAllByUser(userId: UserId): Promise<APIKey[]> {
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
   * Look up a key by its SHA-256 hash for authentication.
   *
   * `keyHash` is `@unique`, so this is a single indexed lookup and the only
   * supported way to resolve a presented key. Revoked and expired keys are
   * excluded here rather than in the caller, so no code path can accidentally
   * authenticate one.
   */
  async findAuthenticatableByHash(keyHash: string): Promise<APIKey | null> {
    try {
      return await this.prisma.aPIKey.findFirst({
        where: {
          keyHash,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
    } catch (error) {
      this.handleError(error, 'findAuthenticatableByHash');
    }
  }

  /**
   * Unfiltered hash lookup.
   *
   * Only for explaining *why* a key was rejected (revoked vs expired vs never
   * issued) for logging. Never use this to decide access — it will happily
   * return a revoked or expired key.
   */
  async findByHashIncludingInactive(keyHash: string): Promise<APIKey | null> {
    try {
      return await this.prisma.aPIKey.findUnique({ where: { keyHash } });
    } catch (error) {
      this.handleError(error, 'findByHashIncludingInactive');
    }
  }

  /**
   * Record that a key was just used.
   *
   * Deliberately failure-tolerant: a failure here must not fail the request the
   * key already authorised.
   */
  async recordUsage(id: string): Promise<void> {
    try {
      await this.prisma.aPIKey.update({
        where: { id },
        data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
      });
    } catch (error) {
      // Swallow: usage tracking is observability, not authorisation.
      console.warn('Failed to record API key usage', error);
    }
  }

  /**
   * Find an API key by ID, scoped to a specific user (ownership check)
   */
  async findByIdScoped(id: string, userId: UserId): Promise<APIKey | null> {
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
    userId: UserId,
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
  async revoke(id: string, userId: UserId): Promise<APIKey> {
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
  async deleteById(id: string, userId: UserId): Promise<{ success: boolean }> {
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
  async countByUser(userId: UserId): Promise<number> {
    try {
      return await this.prisma.aPIKey.count({ where: { userId } });
    } catch (error) {
      this.handleError(error, 'countByUser');
    }
  }
}

