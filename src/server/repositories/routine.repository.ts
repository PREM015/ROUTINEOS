import { DayType, RoutineLogStatus } from '@/generated/prisma';
import type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  DayTypeDefinition,
  Prisma,
} from '@/generated/prisma';
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
   * Find template by day type (legacy - uses enum)
   * @deprecated Use findTemplateByDayTypeId instead
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
   * Find template by day type ID (new - uses DayTypeDefinition)
   */
  async findTemplateByDayTypeId(
    userId: string,
    dayTypeId: string
  ): Promise<RoutineTemplate | null> {
    try {
      return await this.prisma.routineTemplate.findFirst({
        where: { userId, dayTypeId, isActive: true },
        include: {
          blocks: {
            orderBy: { sortOrder: 'asc' },
            include: { category: true },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findTemplateByDayTypeId');
    }
  }

  /**
   * Find day type definition by slug
   */
  async findDayTypeDefinitionBySlug(
    userId: string,
    slug: string
  ) {
    try {
      return await this.prisma.dayTypeDefinition.findUnique({
        where: { userId_slug: { userId, slug } },
      });
    } catch (error) {
      this.handleError(error, 'findDayTypeDefinitionBySlug');
    }
  }

  // ============================================================================
  // Day Type Definitions
  // ============================================================================

  /**
   * All of a user's day-type definitions, in display order.
   */
  async listDayTypeDefinitions(userId: string) {
    try {
      return await this.prisma.dayTypeDefinition.findMany({
        where: { userId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    } catch (error) {
      this.handleError(error, 'listDayTypeDefinitions');
    }
  }

  /**
   * Find a day-type definition by id, scoped to its owner.
   */
  async findDayTypeDefinitionById(dayTypeId: string, userId: string) {
    try {
      return await this.prisma.dayTypeDefinition.findFirst({
        where: { id: dayTypeId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findDayTypeDefinitionById');
    }
  }

  /**
   * Create a day-type definition.
   */
  async createDayTypeDefinition(
    data: Prisma.DayTypeDefinitionCreateInput
  ): Promise<DayTypeDefinition> {
    try {
      return await this.prisma.dayTypeDefinition.create({ data });
    } catch (error) {
      this.handleError(error, 'createDayTypeDefinition');
    }
  }

  /**
   * Update a day-type definition.
   */
  async updateDayTypeDefinition(
    dayTypeId: string,
    userId: string,
    data: Prisma.DayTypeDefinitionUpdateInput
  ): Promise<DayTypeDefinition> {
    try {
      return await this.prisma.dayTypeDefinition.update({
        where: { id: dayTypeId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateDayTypeDefinition');
    }
  }

  /**
   * Clear the default flag from every one of the user's day types.
   *
   * Kept as its own method so the "only one default" rule has exactly one
   * implementation, called by the service rather than inlined per route.
   */
  async clearDefaultDayTypeFlags(userId: string): Promise<void> {
    try {
      await this.prisma.dayTypeDefinition.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    } catch (error) {
      this.handleError(error, 'clearDefaultDayTypeFlags');
    }
  }

  /**
   * Delete a day-type definition.
   */
  async deleteDayTypeDefinition(
    dayTypeId: string,
    userId: string
  ): Promise<DayTypeDefinition> {
    try {
      return await this.prisma.dayTypeDefinition.delete({
        where: { id: dayTypeId, userId },
      });
    } catch (error) {
      this.handleError(error, 'deleteDayTypeDefinition');
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
   * Clear the default flag from every template of a given day type.
   *
   * The "one default template per day type" rule is owned by the service; this
   * is the primitive it applies, kept in a transaction with the create/update
   * so two defaults can never coexist.
   */
  async clearDefaultTemplateFlags(
    userId: string,
    dayType: DayType
  ): Promise<number> {
    try {
      const result = await this.prisma.routineTemplate.updateMany({
        where: { userId, dayType, isDefault: true },
        data: { isDefault: false },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'clearDefaultTemplateFlags');
    }
  }

  /**
   * Create a template, atomically clearing other defaults for the same day type
   * when `isDefault` is set.
   */
  async createTemplateWithDefaultFlag(
    userId: string,
    data: Prisma.RoutineTemplateCreateInput,
    isDefault: boolean,
    dayType: DayType
  ): Promise<RoutineTemplate> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.routineTemplate.updateMany({
            where: { userId, dayType, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.routineTemplate.create({ data });
      });
    } catch (error) {
      this.handleError(error, 'createTemplateWithDefaultFlag');
    }
  }

  /**
   * Update a template, atomically clearing other defaults for the same day type
   * when `isDefault` is set.
   */
  async updateTemplateWithDefaultFlag(
    templateId: string,
    userId: string,
    data: Prisma.RoutineTemplateUpdateInput,
    isDefault: boolean,
    dayType: DayType
  ): Promise<RoutineTemplate> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.routineTemplate.updateMany({
            where: { userId, dayType, isDefault: true, id: { not: templateId } },
            data: { isDefault: false },
          });
        }
        return tx.routineTemplate.update({
          where: { id: templateId, userId },
          data,
        });
      });
    } catch (error) {
      this.handleError(error, 'updateTemplateWithDefaultFlag');
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
   * Remove the exception for a (user, date) pair, if any. Returns the count.
   */
  async deleteExceptionsForDate(userId: string, date: string): Promise<number> {
    try {
      const result = await this.prisma.routineException.deleteMany({
        where: { userId, date },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'deleteExceptionsForDate');
    }
  }

  /**
   * Upsert the exception for a (user, date) pair, so toggling a day type never
   * creates duplicates.
   */
  async upsertException(
    userId: string,
    date: string,
    data: {
      dayType: DayType;
      templateId: string | null;
      note: string | null;
      reason?: string | null;
    }
  ) {
    try {
      return await this.prisma.routineException.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, ...data },
        update: data,
      });
    } catch (error) {
      this.handleError(error, 'upsertException');
    }
  }

  /**
   * Exceptions for a user, newest first, optionally for a single date.
   */
  async listExceptions(
    userId: string,
    date?: string
  ): Promise<Prisma.RoutineExceptionGetPayload<{ include: { template: true } }>[]> {
    try {
      return await this.prisma.routineException.findMany({
        where: { userId, ...(date ? { date } : {}) },
        include: { template: true },
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'listExceptions');
    }
  }

  /**
   * Create or update the single log for a (user, block, date).
   */
  async upsertLog(
    userId: string,
    routineBlockId: string,
    date: string,
    data: { status: RoutineLogStatus; note?: string | null }
  ): Promise<RoutineLog> {
    try {
      return await this.prisma.routineLog.upsert({
        where: { userId_routineBlockId_date: { userId, routineBlockId, date } },
        create: { userId, routineBlockId, date, ...data },
        update: data,
      });
    } catch (error) {
      this.handleError(error, 'upsertLog');
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
  ): Promise<Prisma.RoutineExceptionGetPayload<{ include: { template: true } }>[]> {
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
  ): Promise<
    Prisma.RoutineLogGetPayload<{
      include: {
        routineBlock: {
          select: {
            id: true;
            title: true;
            startTime: true;
            endTime: true;
            category: true;
          };
        };
      };
    }>[]
  > {
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
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
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