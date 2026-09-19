import type { Attachment } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Attachment Repository
 * Bulk listing and deletion for file attachments.
 */

export interface AttachmentQueryOptions {
  limit?: number;
  offset?: number;
  entityType?: string;
  entityId?: string;
}

export class AttachmentRepository extends BaseRepository {
  /**
   * List attachments for a user with optional entity filters
   */
  async findAllByUser(
    userId: string,
    opts: AttachmentQueryOptions = {}
  ): Promise<Attachment[]> {
    try {
      const where: Record<string, unknown> = { userId };
      if (opts.entityType) where.entityType = opts.entityType;
      if (opts.entityId) where.entityId = opts.entityId;

      return await this.prisma.attachment.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        ...this.buildPaginationQuery(opts.limit, opts.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAllByUser');
    }
  }

  /**
   * Count attachments for a user
   */
  async countByUser(userId: string, opts: AttachmentQueryOptions = {}): Promise<number> {
    try {
      const where: Record<string, unknown> = { userId };
      if (opts.entityType) where.entityType = opts.entityType;
      if (opts.entityId) where.entityId = opts.entityId;

      return await this.prisma.attachment.count({ where });
    } catch (error) {
      this.handleError(error, 'countByUser');
    }
  }

  /**
   * Delete all attachments for a user (optionally scoped to an entity).
   * Returns the number of deleted records.
   */
  async deleteAllByUser(
    userId: string,
    opts: AttachmentQueryOptions = {}
  ): Promise<number> {
    try {
      const where: Record<string, unknown> = { userId };
      if (opts.entityType) where.entityType = opts.entityType;
      if (opts.entityId) where.entityId = opts.entityId;

      const result = await this.prisma.attachment.deleteMany({ where });
      return result.count;
    } catch (error) {
      this.handleError(error, 'deleteAllByUser');
    }
  }
}

export const attachmentRepository = new AttachmentRepository();
