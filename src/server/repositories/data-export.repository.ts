import type { DataExport, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Data Export Repository
 * Database operations for the `DataExport` model (user data exports/backups).
 */
export class DataExportRepository extends BaseRepository {
  /**
   * Create an export row.
   */
  async create(data: Prisma.DataExportCreateInput): Promise<DataExport> {
    try {
      return await this.prisma.dataExport.create({ data });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Update an export row.
   */
  async update(
    exportId: string,
    data: Prisma.DataExportUpdateInput
  ): Promise<DataExport> {
    try {
      return await this.prisma.dataExport.update({
        where: { id: exportId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * All of a user's exports, newest first.
   */
  async findAllByUser(userId: UserId): Promise<DataExport[]> {
    try {
      return await this.prisma.dataExport.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findAllByUser');
    }
  }

  /**
   * Find an export by id, unscoped — callers must verify `userId`.
   */
  async findById(exportId: string): Promise<DataExport | null> {
    try {
      return await this.prisma.dataExport.findUnique({
        where: { id: exportId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Delete an export row.
   */
  async delete(exportId: string): Promise<DataExport> {
    try {
      return await this.prisma.dataExport.delete({
        where: { id: exportId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}

export const dataExportRepository = new DataExportRepository();
