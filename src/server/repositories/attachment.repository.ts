import type { Attachment, Prisma } from '@/generated/prisma';
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

  /**
   * Create an attachment row.
   */
  async create(data: Prisma.AttachmentCreateInput): Promise<Attachment> {
    try {
      return await this.prisma.attachment.create({ data });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find an attachment by id, unscoped — callers must verify `userId`.
   */
  async findById(attachmentId: string): Promise<Attachment | null> {
    try {
      return await this.prisma.attachment.findUnique({
        where: { id: attachmentId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Update an attachment row.
   */
  async update(
    attachmentId: string,
    data: Prisma.AttachmentUpdateInput
  ): Promise<Attachment> {
    try {
      return await this.prisma.attachment.update({
        where: { id: attachmentId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a single attachment row.
   */
  async delete(attachmentId: string): Promise<Attachment> {
    try {
      return await this.prisma.attachment.delete({
        where: { id: attachmentId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}

export const attachmentRepository = new AttachmentRepository();

