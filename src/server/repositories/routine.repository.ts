import { DayType, RoutineLogStatus } from '@/generated/prisma';
import type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  DayTypeDefinition,
  Prisma,
} from '@/generated/prisma';
import { DEFAULT_DAY_TYPES } from '@/constants/day-types';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

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
    userId: UserId
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
  async findTemplateWithBlocks(templateId: string, userId: UserId) {
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
   *
   * `dayTypeDef` is included so callers can derive the DayType classification
   * from the definition's slug; the stored `dayType` column is only a coarse
   * fallback ('CUSTOM') for templates connected to a definition.
   */
  async findAllTemplates(userId: UserId, includeInactive = false) {
    try {
      return await this.prisma.routineTemplate.findMany({
        where: { userId, ...(includeInactive ? {} : { isActive: true }) },
        include: {
          blocks: {
            orderBy: { sortOrder: 'asc' },
          },
          dayTypeDef: true,
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
    userId: UserId,
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
    userId: UserId,
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
    userId: UserId,
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
   *
   * Archived definitions are excluded: they must not be offered in a picker, and
   * `onDelete: SetNull` means an existing exception referencing one still
   * resolves — it just falls back to its own `dayType` column.
   *
   * `include` is not passed in, so Prisma rejects `_count` at runtime. Callers
   * that need related counts (the settings page shows templates per day type)
   * must go through `listDayTypeDefinitionsWithCounts`.
   */
  async listDayTypeDefinitions(userId: UserId) {
    try {
      return await this.prisma.dayTypeDefinition.findMany({
        where: { userId, isArchived: false },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    } catch (error) {
      this.handleError(error, 'listDayTypeDefinitions');
    }
  }

  /**
   * The same list, with archived rows and a per-day-type usage count.
   *
   * Separate from `listDayTypeDefinitions` because the `include` changes the
   * return type, and a picker must not surface archived entries while the
   * management page does. The counts gate the Archive action: a day type that
   * still has templates, exceptions or habit assignments attached is worth
   * warning about before it is hidden.
   */
  async listDayTypeDefinitionsWithCounts(userId: UserId) {
    try {
      return await this.prisma.dayTypeDefinition.findMany({
        where: { userId },
        include: {
          _count: {
            select: {
              routineTemplates: true,
              routineExceptions: true,
              habitAssignments: true,
              goalAssignments: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    } catch (error) {
      this.handleError(error, 'listDayTypeDefinitionsWithCounts');
    }
  }

  /**
   * Find a day-type definition by id, scoped to its owner.
   */
  async findDayTypeDefinitionById(dayTypeId: string, userId: UserId) {
    try {
      return await this.prisma.dayTypeDefinition.findFirst({
        where: { id: dayTypeId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findDayTypeDefinitionById');
    }
  }

  /**
   * Create the canonical default `DayTypeDefinition` rows for a new user.
   *
   * Idempotent: skips any slug the user already has, so re-running it for an
   * existing account (the backfill `scripts/seed-day-types.ts` performs) is safe
   * and never duplicates a day type.
   */
  async createDefaultDayTypes(userId: UserId): Promise<number> {
    try {
      const existing = await this.prisma.dayTypeDefinition.findMany({
        where: { userId },
        select: { slug: true },
      });
      const have = new Set(existing.map((d) => d.slug));

      const toCreate = DEFAULT_DAY_TYPES.filter((d) => !have.has(d.slug)).map(
        (d) => ({
          userId,
          name: d.name,
          slug: d.slug,
          color: d.color,
          icon: d.icon,
          description: d.description,
          isDefault: true,
          isArchived: false,
          sortOrder: d.sortOrder,
        })
      );

      if (toCreate.length === 0) return 0;

      const result = await this.prisma.dayTypeDefinition.createMany({
        data: toCreate,
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'createDefaultDayTypes');
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
    userId: UserId,
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
  async clearDefaultDayTypeFlags(userId: UserId): Promise<void> {
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
   * Archive a day-type definition (soft delete).
   *
   * Prefer this over `deleteDayTypeDefinition`: the relations use
   * `onDelete: SetNull`, so a hard delete silently detaches every template,
   * exception and habit assignment pointing at this day type.
   */
  async archiveDayTypeDefinition(
    dayTypeId: string,
    userId: UserId
  ): Promise<DayTypeDefinition> {
    try {
      return await this.prisma.dayTypeDefinition.update({
        where: { id: dayTypeId, userId },
        data: { isArchived: true },
      });
    } catch (error) {
      this.handleError(error, 'archiveDayTypeDefinition');
    }
  }

  /** Restore a soft-deleted day-type definition. */
  async unarchiveDayTypeDefinition(
    dayTypeId: string,
    userId: UserId
  ): Promise<DayTypeDefinition> {
    try {
      return await this.prisma.dayTypeDefinition.update({
        where: { id: dayTypeId, userId },
        data: { isArchived: false },
      });
    } catch (error) {
      this.handleError(error, 'unarchiveDayTypeDefinition');
    }
  }

  /**
   * Delete a day-type definition outright.
   *
   * Retained only for a genuine hard delete of an already-archived definition
   * that has no remaining references; prefer the archive methods above.
   */
  async deleteDayTypeDefinition(
    dayTypeId: string,
    userId: UserId
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
    userId: UserId,
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
    userId: UserId,
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
    userId: UserId,
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
    userId: UserId,
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
  async deleteExceptionsForDate(userId: UserId, date: string): Promise<number> {
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
   *
   * `dayTypeId` links to the user's `DayTypeDefinition` and is what makes a
   * *custom* day type distinguishable. `dayType` alone is a six-value enum
   * where every custom day type collapses to `CUSTOM`, so it could never
   * identify which one the user picked — the column was simply not written
   * here, which is why `/today` and `/dashboard` had no way to show or restore
   * a custom day type.
   */
  /**
 * Write many exceptions for one user in a single transaction.
 *
 * Bulk because applying a schedule across a range is one user action: doing it
 * date-by-date would be N round trips and, worse, could leave the range half
 * applied if a later date failed. Transactional so the range is all-or-nothing -
 * a partial apply is exactly what the caller reports as 207, and it must not be
 * the *storage* layer producing one by accident.
 */
async upsertExceptions(
    userId: UserId,
    rows: {
      date: string;
      dayType: DayType;
      dayTypeId?: string | null;
      templateId: string | null;
      note?: string | null;
      reason?: string | null;
    }[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    try {
      const result = await this.prisma.$transaction(
        rows.map((row) =>
          this.prisma.routineException.upsert({
            where: { userId_date: { userId, date: row.date } },
            create: { userId, ...row },
            update: {
              dayType: row.dayType,
              dayTypeId: row.dayTypeId ?? null,
              templateId: row.templateId,
              note: row.note ?? null,
              reason: row.reason ?? null,
            },
          }),
        ),
      );
      return result.length;
    } catch (error) {
      this.handleError(error, 'upsertExceptions');
    }
  }

  async upsertException(
    userId: UserId,
    date: string,
    data: {
      dayType: DayType;
      dayTypeId?: string | null;
      templateId: string | null;
      note: string | null;
      reason?: string | null;
    }
  ): Promise<
    Prisma.RoutineExceptionGetPayload<{ include: { dayTypeDef: true } }>
  > {
    try {
      const { dayTypeId, ...rest } = data;
      // The FK scalar `dayTypeId` is written directly rather than through
      // `dayTypeDef: { connect }`. `RoutineException` carries two optional
      // relations with `onDelete: SetNull`, so Prisma's *checked* input type
      // makes `templateId` unusable alongside a relation operation (it would
      // demand a nested `template: { set: null }`). The unchecked input accepts
      // the raw FK, and it is the same column either way.
      // `null` on update disconnects, so switching from a custom day type back
      // to a built-in one clears the link instead of leaving it dangling.
      const payload = { ...rest, dayTypeId: dayTypeId ?? null };

      return await this.prisma.routineException.upsert({
        where: { userId_date: { userId, date } },
        create: { ...payload, userId, date },
        update: payload,
        include: { dayTypeDef: true },
      });
    } catch (error) {
      this.handleError(error, 'upsertException');
    }
  }

  /**
   * Exceptions for a user, newest first, optionally for a single date.
   *
   * Includes `dayTypeDef` so callers can render the user's own name for a
   * custom day type ("College Day") instead of the generic `CUSTOM` enum.
   */
  async listExceptions(
    userId: UserId,
    date?: string
  ): Promise<
    Prisma.RoutineExceptionGetPayload<{
      include: { template: true; dayTypeDef: true };
    }>[]
  > {
    try {
      return await this.prisma.routineException.findMany({
        where: { userId, ...(date ? { date } : {}) },
        include: { template: true, dayTypeDef: true },
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'listExceptions');
    }
  }

  /**
   * Create or update the single log for a (user, block, date).
   *
   * Routed on the `userId_routineBlockId_date` unique key, so a repeated
   * submission updates the existing row instead of raising P2002. Every field
   * beyond `status` is optional; Prisma ignores keys absent from `data` in the
   * update branch, so a status-only caller leaves the richer fields untouched.
   */
  /**
   * Remove a single day's log for a block.
   *
   * `status` is non-nullable on `RoutineLog`, so "cleared" cannot be expressed
   * as a status value and has to be the absence of the row. Scoped by `userId`
   * and `date` as well as the block, so this cannot remove another account's log
   * even when handed a block id it does not own.
   */
  async deleteLog(userId: UserId, routineBlockId: string, date: string): Promise<void> {
    try {
      await this.prisma.routineLog.deleteMany({
        where: { userId, routineBlockId, date },
      });
    } catch (error) {
      this.handleError(error, 'deleteLog');
    }
  }

  async upsertLog(
    userId: UserId,
    routineBlockId: string,
    date: string,
    data: {
      status: RoutineLogStatus;
      note?: string | null;
      actualStartTime?: string | null;
      actualEndTime?: string | null;
      durationMinutes?: number | null;
      focusRating?: number | null;
      productivityRating?: number | null;
      energyLevel?: number | null;
    }
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
  async deleteTemplate(templateId: string, userId: UserId): Promise<void> {
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
    userId: UserId
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
  /**
 * Highest `sortOrder` currently used on a template, or `-1` when it has none.
 *
 * The caller writes `max + 1` rather than `count`: a count would reuse a slot
 * left behind by a deleted block, because deleting from the middle does not
 * renumber the survivors. `-1` makes the first block land on 0.
 */
async maxSortOrderForTemplate(templateId: string): Promise<number> {
    try {
      const aggregate = await this.prisma.routineBlock.aggregate({
        where: { templateId },
        _max: { sortOrder: true },
      });
      return aggregate._max.sortOrder ?? -1;
    } catch (error) {
      this.handleError(error, 'maxSortOrderForTemplate');
    }
  }

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
   * A block with its owning template, for ownership checks.
   */
  async findBlockByIdForService(blockId: string) {
    try {
      return await this.prisma.routineBlock.findUnique({
        where: { id: blockId },
        include: { template: true, category: true },
      });
    } catch (error) {
      this.handleError(error, 'findBlockByIdForService');
    }
  }

  /**
   * Atomically swap two blocks' `sortOrder` within a template.
   *
   * Both writes share a transaction because `sortOrder` has no uniqueness
   * constraint: a partial swap (one write landing, the other failing) leaves
   * two blocks with the same order and the list renders them in an arbitrary
   * order until the page is reloaded.
   */
  async swapBlockOrder(
    userId: UserId,
    blockId: string,
    peerId: string
  ): Promise<RoutineBlock[]> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [block, peer] = await Promise.all([
          tx.routineBlock.findFirst({ where: { id: blockId, userId } }),
          tx.routineBlock.findFirst({ where: { id: peerId, userId } }),
        ]);

        if (!block || !peer) {
          throw new Error('Block not found');
        }
        if (block.templateId !== peer.templateId) {
          throw new Error('Blocks belong to different templates');
        }

        await Promise.all([
          tx.routineBlock.update({ where: { id: blockId }, data: { sortOrder: peer.sortOrder } }),
          tx.routineBlock.update({ where: { id: peerId }, data: { sortOrder: block.sortOrder } }),
        ]);

        return tx.routineBlock.findMany({
          where: { templateId: block.templateId },
          include: { category: true },
          orderBy: { sortOrder: 'asc' },
        });
      });
    } catch (error) {
      this.handleError(error, 'swapBlockOrder');
    }
  }

  /**
   * Update routine block
   */
  async updateBlock(
    blockId: string,
    userId: UserId,
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
  async deleteBlock(blockId: string, userId: UserId): Promise<void> {
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
    userId: UserId,
    date: string
  ): Promise<Prisma.RoutineExceptionGetPayload<{ include: { template: true; dayTypeDef: true } }> | null> {
    try {
      return await this.prisma.routineException.findFirst({
        where: { userId, date },
        // `dayTypeDef` carries the user's display name for a custom day type.
        // Without it a chosen "College Day" renders as the generic `CUSTOM`.
        include: { template: true, dayTypeDef: true },
      });
    } catch (error) {
      this.handleError(error, 'findException');
    }
  }

  /**
   * Find exceptions within a date range (inclusive)
   */
  async findExceptionsByRange(
    userId: UserId,
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
    userId: UserId,
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
  async findLogsByDate(
    userId: UserId,
    date: string
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
            templateId: true;
          };
        };
      };
    }>[]
  > {
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
              templateId: true,
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
    userId: UserId,
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
            templateId: true;
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
              templateId: true,
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
  async countCompletedForDate(userId: UserId, date: string): Promise<number> {
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
