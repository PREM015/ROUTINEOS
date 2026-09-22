import { DayType, RoutineLogStatus } from '@prisma/client';
import type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  Prisma,
} from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Routine Repository
 * Database operations for Routine models
 */

export class RoutineRepository extends BaseRepository {
  /**
   * Find routine template by ID
   */
  async findTemplateById(
    templateId: string,
    userId: string
  ): Promise<RoutineTemplate | null> {
    try {
      return await this.prisma.routineTemplate.findFirst({
        where: { id: templateId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findTemplateById');
    }
  }

  /**
   * Find template with blocks
   */
  async findTemplateWithBlocks(templateId: string, userId: string) {
    try {
      return await this.prisma.routineTemplate.findFirst({
        where: { id: templateId, userId },
        include: {
          blocks: {
            orderBy: { sortOrder: 'asc' },
            include: {
              category: true,
              logs: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              },
            },
          },
          exceptions: true,
        },
      });
    } catch (error) {
      this.handleError(error, 'findTemplateWithBlocks');
    }
  }

  /**
   * Find all templates for user
   */
  async findAllTemplates(userId: string, includeInactive = false) {
    try {
      return await this.prisma.routineTemplate.findMany({
        where: { userId, ...(includeInactive ? {} : { isActive: true }) },
        include: {
          blocks: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: { blocks: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findAllTemplates');
    }
  }

  /**
   * Find template by day type
   */
  async findTemplateByDayType(
    userId: string,
    dayType: DayType
  ): Promise<RoutineTemplate | null> {
    try {
      return await this.prisma.routineTemplate.findFirst({
        where: { userId, dayType, isActive: true },
        include: {
          blocks: {
            orderBy: { sortOrder: 'asc' },
            include: { category: true },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findTemplateByDayType');
    }
  }

  /**
   * Create routine template
   */
  async createTemplate(
    data: Prisma.RoutineTemplateCreateInput
  ): Promise<RoutineTemplate> {
    try {
      return await this.prisma.routineTemplate.create({ data });
    } catch (error) {
      this.handleError(error, 'createTemplate');
    }
  }

  /**
   * Update routine template
   */
  async updateTemplate(
    templateId: string,
    userId: string,
    data: Prisma.RoutineTemplateUpdateInput
  ): Promise<RoutineTemplate> {
    try {
      return await this.prisma.routineTemplate.update({
        where: { id: templateId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateTemplate');
    }
  }

  /**
   * Delete routine template
   */
  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    try {
      await this.prisma.routineTemplate.delete({
        where: { id: templateId, userId },
      });
    } catch (error) {
      this.handleError(error, 'deleteTemplate');
    }
  }

  // ============================================================================
  // Routine Blocks
  // ============================================================================

  /**
   * Find routine block
   */
  async findBlockById(
    blockId: string,
    userId: string
  ): Promise<RoutineBlock | null> {
    try {
      return await this.prisma.routineBlock.findFirst({
        where: { id: blockId, userId },
        include: {
          category: true,
          logs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findBlockById');
    }
  }

  /**
   * Find blocks for template
   */
  async findBlocksByTemplate(templateId: string): Promise<RoutineBlock[]> {
    try {
      return await this.prisma.routineBlock.findMany({
        where: { templateId },
        include: { category: true },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findBlocksByTemplate');
    }
  }

  /**
   * Create routine block
   */
  async createBlock(data: Prisma.RoutineBlockCreateInput): Promise<RoutineBlock> {
    try {
      return await this.prisma.routineBlock.create({ data });
    } catch (error) {
      this.handleError(error, 'createBlock');
    }
  }

  /**
   * Update routine block
   */
  async updateBlock(
    blockId: string,
    userId: string,
    data: Prisma.RoutineBlockUpdateInput
  ): Promise<RoutineBlock> {
    try {
      return await this.prisma.routineBlock.update({
        where: { id: blockId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateBlock');
    }
  }

  /**
   * Delete routine block
   */
  async deleteBlock(blockId: string, userId: string): Promise<void> {
    try {
      await this.prisma.routineBlock.delete({
        where: { id: blockId, userId },
      });
    } catch (error) {
      this.handleError(error, 'deleteBlock');
    }
  }

  // ============================================================================
  // Routine Exceptions
  // ============================================================================

  /**
   * Find exception for date
   */
  async findException(
    userId: string,
    date: string
  ): Promise<RoutineException | null> {
    try {
      return await this.prisma.routineException.findFirst({
        where: { userId, date },
        include: { template: true },
      });
    } catch (error) {
      this.handleError(error, 'findException');
    }
  }

  /**
   * Find exceptions within a date range (inclusive)
   */
  async findExceptionsByRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<RoutineException[]> {
    try {
      return await this.prisma.routineException.findMany({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: { template: true },
        orderBy: { date: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findExceptionsByRange');
    }
  }

  /**
   * Create routine exception
   */
  async createException(
    data: Prisma.RoutineExceptionCreateInput
  ): Promise<RoutineException> {
    try {
      return await this.prisma.routineException.create({ data });
    } catch (error) {
      this.handleError(error, 'createException');
    }
  }

  /**
   * Delete exception
   */
  async deleteException(exceptionId: string): Promise<void> {
    try {
      await this.prisma.routineException.delete({
        where: { id: exceptionId },
      });
    } catch (error) {
      this.handleError(error, 'deleteException');
    }
  }

  // ============================================================================
  // Routine Logs
  // ============================================================================

  /**
   * Find routine log
   */
  async findLog(
    blockId: string,
    userId: string,
    date: string
  ): Promise<RoutineLog | null> {
    try {
      return await this.prisma.routineLog.findFirst({
        where: { routineBlockId: blockId, userId, date },
      });
    } catch (error) {
      this.handleError(error, 'findLog');
    }
  }

  /**
   * Find logs for date
   */
  async findLogsByDate(userId: string, date: string): Promise<RoutineLog[]> {
    try {
      return await this.prisma.routineLog.findMany({
        where: { userId, date },
        include: {
          routineBlock: {
            select: {
              id: true,
              title: true,
              startTime: true,
              endTime: true,
              category: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findLogsByDate');
    }
  }

  /**
   * Find logs for a date range (inclusive) in one query
   */
  async findLogsByRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<RoutineLog[]> {
    try {
      return await this.prisma.routineLog.findMany({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          routineBlock: {
            select: {
              id: true,
              title: true,
              startTime: true,
              endTime: true,
              category: true,
            },
          },
        },
        orderBy: { date: 'asc', createdAt: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findLogsByRange');
    }
  }

  /**
   * Create routine log
   */
  async createLog(data: Prisma.RoutineLogCreateInput): Promise<RoutineLog> {
    try {
      return await this.prisma.routineLog.create({ data });
    } catch (error) {
      this.handleError(error, 'createLog');
    }
  }

  /**
   * Update routine log
   */
  async updateLog(
    logId: string,
    data: Prisma.RoutineLogUpdateInput
  ): Promise<RoutineLog> {
    try {
      return await this.prisma.routineLog.update({
        where: { id: logId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateLog');
    }
  }

  /**
   * Count completed blocks for date
   */
  async countCompletedForDate(userId: string, date: string): Promise<number> {
    try {
      return await this.prisma.routineLog.count({
        where: {
          userId,
          date,
          status: RoutineLogStatus.COMPLETED,
        },
      });
    } catch (error) {
      this.handleError(error, 'countCompletedForDate');
    }
  }
}