import type {
  DayType,
  Prisma,
  RoutineBlock,
  RoutineLog,
  RoutineLogStatus,
  RoutineTemplate,
} from '@/generated/prisma';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import type {
  DayRoutine,
  RoutineTemplateWithBlocks,
  CreateRoutineTemplateInput,
  CreateRoutineBlockInput,
  RoutineProgressPeriod,
  RoutineProgressResponse,
  RoutineProgressDay,
  RoutineAnalytics,
} from '@/types/routine';
import { resolveDayTypeFromException } from '@/lib/scheduling/resolve-routine';
import { slugToDayType } from '@/constants/routine';
import { isOvernightBlock, isTimeOverlap, calculateBlockDuration } from '@/lib/routine/duration';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { getPeriodRange } from '@/lib/period-range';
import { UserRepository } from '@/server/repositories/user.repository';

/**
 * Routine Service
 * Business logic for routine management
 */

/**
 * The slice of a routine template the progress view needs.
 *
 * `findAllTemplates` returns blocks without their `category` relation and no
 * `exceptions`, so `RoutineTemplateWithBlocks` never described its result —
 * casting to it only worked by accident and broke the moment the query's
 * inferred payload changed.
 */
type ProgressTemplate = Pick<RoutineTemplate, 'id' | 'dayType' | 'name'> & {
  blocks: RoutineBlock[];
  /**
   * The linked day-type preset. `findAllTemplates` selects it, and without it a
   * per-preset comparison has nothing to label its rows with — every user-defined
   * preset collapses to the `CUSTOM` enum, so the enum alone would render several
   * identical "Custom" rows.
   */
  dayTypeDef?: { id: string; name: string; slug: string; color: string | null } | null;
};

/**
 * A `RoutineLog`, reduced to the two facts attribution needs.
 *
 * Structural rather than a Prisma payload so both `findLogsByDate` and
 * `findLogsByRange` can be passed in without either one having to satisfy the
 * other's exact include list.
 */
type AttributableLog = { status: string; routineBlock: { templateId: string } };

/**
 * Group a date's routine logs by the template their blocks belong to.
 *
 * ## Why this exists
 *
 * `RoutineLog` is keyed by `routineBlockId` alone, so a log does not record *which
 * schedule* it was ticked against. Changing a date's day type afterwards — a
 * `RoutineException` pointing at a different template — makes the date resolve a
 * *different* block set, and the earlier logs fall outside it.
 *
 * The failure this caused was silent, and it hid real work. With 4 blocks completed
 * against "College Day" and an exception then pointing the day at "PLACEMENT", the
 * resolved day held PLACEMENT's blocks, the join matched nothing, and progress
 * reported **0 completed, 0%** for a day with four completions in the database.
 * Meanwhile `DailyScore.routineCompletionRate` — which counts log rows and never
 * joins to blocks — reported a confident **100%** for the same day. Neither number
 * was wrong on its own terms; the contradiction is what exposed the broken join.
 *
 * ## The rule
 *
 * Attribution is by the template on the log's block, which is a fact about the log
 * rather than a guess about which schedule was active. A caller pairs that with the
 * block count of the matching template, so a day whose logs and resolved template
 * disagree is still scored against something real instead of being zeroed.
 *
 * The honest limitation: when a day's logs span two templates the caller has to pick
 * one, and that is a choice rather than a measurement. Making it exact means
 * recording `templateId` on `RoutineLog` at write time — a schema change, not done
 * here.
 */
export function attributeLogsByTemplate(
  logs: readonly AttributableLog[]
): Map<string, { templateId: string; total: number; completed: number }> {
  const byTemplate = new Map<string, { templateId: string; total: number; completed: number }>();
  for (const log of logs) {
    const templateId = log.routineBlock.templateId;
    const row = byTemplate.get(templateId) ?? { templateId, total: 0, completed: 0 };
    row.total += 1;
    if (log.status === 'COMPLETED') row.completed += 1;
    byTemplate.set(templateId, row);
  }
  return byTemplate;
}

export class RoutineService {
  private routineRepository: RoutineRepository;
  private userRepository: UserRepository;

  constructor() {
    this.routineRepository = new RoutineRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Get routine for specific date
   */
  async getRoutineForDate(userId: string, date: Date | string): Promise<DayRoutine> {
    const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

    // Check for exception
    const exception = await this.routineRepository.findException(userId, dateStr);

    // Apply the shared day-type rule (exception wins, else natural weekday).
    const resolved = resolveDayTypeFromException(dateStr, 'UTC', exception);
    const dayType: DayType = resolved.dayType;
    const templateId: string | null = resolved.templateId;

    // Get template
    let template: RoutineTemplateWithBlocks | null = null;
    if (templateId) {
      template = (await this.routineRepository.findTemplateWithBlocks(
        templateId,
        userId,
      )) as RoutineTemplateWithBlocks | null;
    } else {
      template = (await this.routineRepository.findTemplateByDayType(
        userId,
        dayType,
      )) as RoutineTemplateWithBlocks | null;
    }

    if (!template) {
      return {
        date: dateStr,
        dayType,
        template: null,
        exception,
        blocks: [],
        totalBlocks: 0,
        completedBlocks: 0,
        completionRate: 0,
        offScheduleLogs: [],
        dayTypeId: resolved.dayTypeId ?? null,
        dayTypeName: null,
        dayTypeSource: resolved.source,
        templateIsActive: null,
        score: {
          totalScore: null,
          routineCompletionRate: 0,
          habitCompletionRate: null,
          overallGrade: null,
          calculationData: null,
        },
      };
    }

    // Get logs for the date
    const logs = await this.routineRepository.findLogsByDate(userId, dateStr);
    const logMap = new Map(logs.map((log) => [log.routineBlockId, log]));

    // Build blocks with logs
    const blocks = template.blocks.map((block) => ({
      id: block.id,
      startTime: block.startTime,
      endTime: block.endTime,
      title: block.title,
      description: block.description,
      notes: block.notes,
      color: block.color,
      icon: block.icon,
category: block.category
        ? {
            id: block.category.id,
            name: block.category.name,
            color: block.category.color,
            icon: block.category.icon,
          }
          : null,
        categoryId: block.categoryId ?? null,
        energyLevel: block.energyLevel,
      trackCompletion: block.trackCompletion,
      durationMinutes: calculateBlockDuration(block.startTime, block.endTime),
      isOvernight: isOvernightBlock(block.startTime, block.endTime),
      log: logMap.get(block.id) || null,
    }));

    /*
     * Completion, attributed to the template the logs were written against.
     *
     * This counted EVERY log for the date over `blocks.length`, which is ONE
     * template's block count. So a numerator drawn from one schedule was divided by
     * a denominator from another, and it disagreed with `getRoutineProgress` - which
     * matched logs to the resolved blocks and reported 0 - for the same day.
     *
     * `RoutineLog` stores only its `routineBlockId`, so changing the day's day type
     * afterwards orphans those rows from the block set the date now resolves. With
     * work completed under one schedule and the day switched to another, that
     * reported 0 completions for a day the user had genuinely finished.
     *
     * See `attributeLogsByTemplate` for the rule.
     */
    const logsByTemplate = attributeLogsByTemplate(logs);
    const offScheduleIds = [...logsByTemplate.keys()].filter((id) => id !== template.id);

    const offScheduleLogs: NonNullable<DayRoutine['offScheduleLogs']> = [];
    for (const templateId of offScheduleIds) {
      const source = await this.routineRepository.findTemplateWithBlocks(templateId, userId);
      if (!source) continue;
      const counts = logsByTemplate.get(templateId);
      for (const log of logs) {
        if (log.routineBlock.templateId !== templateId || log.status !== 'COMPLETED') continue;
        offScheduleLogs.push({
          blockId: log.routineBlockId,
          title: log.routineBlock.title,
          templateId,
          templateName: source.name,
          completed: counts?.completed ?? 0,
        });
      }
    }

    // Scored against the schedule the work was done under when that differs from the
    // one the date resolves to; otherwise against the resolved template, which is
    // every ordinary day.
    let scoredTotal = blocks.length;
    let scoredCompleted = logsByTemplate.get(template.id)?.completed ?? 0;
    if (offScheduleLogs.length > 0) {
      const sourceTemplateId = offScheduleLogs[0]!.templateId;
      const source = await this.routineRepository.findTemplateWithBlocks(sourceTemplateId, userId);
      if (source && source.blocks.length > 0) {
        scoredTotal = source.blocks.length;
        scoredCompleted = logsByTemplate.get(sourceTemplateId)?.completed ?? 0;
      }
    }
    const completedBlocks = Math.min(scoredCompleted, scoredTotal);
    const attributedRate = scoredTotal > 0 ? Math.round((completedBlocks / scoredTotal) * 100) : 0;

    return {
      date: dateStr,
      dayType,
      template,
      exception,
      blocks,
      totalBlocks: scoredTotal,
      completedBlocks,
      completionRate: attributedRate,
      offScheduleLogs,
      dayTypeId: resolved.dayTypeId ?? template?.dayTypeId ?? null,
      dayTypeName: template?.dayTypeDef?.name ?? null,
      dayTypeSource: resolved.source,
      templateIsActive: template?.isActive ?? null,
      score: {
        totalScore: null,
        routineCompletionRate: attributedRate,
        habitCompletionRate: null,
        
        overallGrade: null,
        calculationData: null,
      },
    };
  }

  /**
   * Routine progress across a day / week / month / year, built from the
   * user's own templates, exceptions, and logs. One block per (block, date),
   * so rows can never duplicate even if toggled repeatedly.
   */
  async getRoutineProgress(
    userId: string,
    period: RoutineProgressPeriod,
    anchorDate?: string,
  ): Promise<RoutineProgressResponse> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const anchor =
      anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(anchorDate) ? anchorDate : getTodayString(timezone);
    const range = getPeriodRange(period, anchor, timezone);
    const startDate = range.start;
    const endDate = range.end;
    const label = range.label;
    const [anchorYear] = anchor.split('-').map(Number);

    const [templates, exceptions, logs] = await Promise.all([
      this.routineRepository.findAllTemplates(userId, true),
      this.routineRepository.findExceptionsByRange(userId, startDate, endDate),
      this.routineRepository.findLogsByRange(userId, startDate, endDate),
    ]);

    // Group by the classification the day-type definition's slug implies, not by
    // the template's stored `dayType`, which is only a coarse 'CUSTOM' fallback
    // for templates connected to a DayTypeDefinition. Without this a 'work-day'
    // template was bucketed as CUSTOM and never matched a WORKDAY date.
    const templatesByDayType = new Map<DayType, ProgressTemplate>();
    for (const template of templates) {
      const dayType = template.dayTypeDef
        ? slugToDayType(template.dayTypeDef.slug)
        : template.dayType;
      if (!templatesByDayType.has(dayType)) {
        templatesByDayType.set(dayType, template);
      }
    }
    // Fallback label for a template with no linked preset row.
    const templatesByDayTypeName = new Map<DayType, string>();
    for (const template of templates) {
      if (template.dayTypeDef) continue;
      if (!templatesByDayTypeName.has(template.dayType)) {
        templatesByDayTypeName.set(template.dayType, template.name);
      }
    }
    const templatesById = new Map<string, ProgressTemplate>();
    for (const template of templates) {
      templatesById.set(template.id, template);
    }

    const exceptionsByDate = new Map<string, { dayType: DayType; templateId: string | null }>();
    for (const exception of exceptions) {
      exceptionsByDate.set(exception.date, {
        dayType: exception.dayType,
        templateId: exception.templateId,
      });
    }

    const statusByKey = new Map<string, string>();
    for (const log of logs) {
      statusByKey.set(`${log.date}::${log.routineBlockId}`, log.status);
    }

    /*
     * Logs indexed by date AND by the template their block belongs to.
     *
     * `statusByKey` above can only answer for blocks in the template a date
     * resolves to, which is exactly the blind spot this fixes. Built once for the
     * whole range so the per-day lookup stays O(1) rather than rescanning every
     * log for every date — a year is 365 dates.
     */
    const logsByDateAndTemplate = new Map<string, Map<string, { total: number; completed: number }>>();
    for (const log of logs) {
      const templateId = log.routineBlock.templateId;
      let perTemplate = logsByDateAndTemplate.get(log.date);
      if (!perTemplate) {
        perTemplate = new Map();
        logsByDateAndTemplate.set(log.date, perTemplate);
      }
      const row = perTemplate.get(templateId) ?? { total: 0, completed: 0 };
      row.total += 1;
      if (log.status === 'COMPLETED') row.completed += 1;
      perTemplate.set(templateId, row);
    }

    const allDays = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate),
    }).map((day) => format(day, 'yyyy-MM-dd'));

    const days: RoutineProgressDay[] = allDays.map((date) => {
      // Exceptions are bulk-loaded above, so apply the shared rule with the
      // in-memory exception rather than calling the async resolver per date.
      const resolved = resolveDayTypeFromException(date, 'UTC', exceptionsByDate.get(date));
      const dayType: DayType = resolved.dayType;
      const template: ProgressTemplate | undefined =
        resolved.templateId !== null
          ? templatesById.get(resolved.templateId)
          : templatesByDayType.get(dayType);

      if (!template) {
        return {
          date,
          dayType,
          dayTypeName: dayType,
          dayTypeColor: null,
          scheduled: false,
          total: 0,
          completed: 0,
          completionRate: 0,
          // No template resolved, so no schedule switch could have been measured.
          scheduleSwitched: false,
          blocks: [],
        };
      }

      const blocks = template.blocks.map((block) => ({
        blockId: block.id,
        title: block.title,
        startTime: block.startTime,
        endTime: block.endTime,
        status: (statusByKey.get(`${date}::${block.id}`) ?? null) as RoutineLog['status'],
        trackCompletion: block.trackCompletion,
      }));

      /*
       * Attributed, for the same reason the day view is — see
       * `attributeLogsByTemplate`.
       *
       * `statusByKey` only holds logs whose block is in THIS template, so a log
       * written against a schedule the date no longer resolves to is invisible to
       * the `blocks.filter` below and the day silently reports zero completions.
       *
       * `logsByDateAndTemplate` is precomputed per date above so this stays a map
       * lookup rather than a scan, and the off-schedule template is scored with its
       * own block count so the rate stays a real fraction rather than a percentage
       * of an unrelated schedule.
       */
      const perTemplate = logsByDateAndTemplate.get(date);
      const attributed = perTemplate ? [...perTemplate.entries()] : [];
      const attributedElsewhere = attributed.filter(([id]) => id !== template.id);
      const candidates = attributedElsewhere.length > 0 ? attributedElsewhere : attributed;
      const dominant = candidates.sort(
        (a, b) => b[1].completed - a[1].completed || b[1].total - a[1].total
      )[0];

      let scoredTotal = blocks.length;
      let scoredCompleted = blocks.filter((block) => block.status === 'COMPLETED').length;
      let scheduleSwitched = false;

      if (dominant && dominant[0] !== template.id) {
        const source = templatesById.get(dominant[0]);
        if (source && source.blocks.length > 0) {
          scoredTotal = source.blocks.length;
          scoredCompleted = Math.min(dominant[1].completed, scoredTotal);
          scheduleSwitched = true;
        }
      }

      return {
        date,
        dayType,
        // The preset's real name. `dayType` is the six-value enum and collapses every
        // user-defined preset to CUSTOM, so a comparison grouped on it alone renders
        // several identical "Custom" rows.
        dayTypeName: template.dayTypeDef?.name ?? template.name,
        dayTypeColor: template.dayTypeDef?.color ?? null,
        scheduled: blocks.length > 0,
        total: scoredTotal,
        completed: scoredCompleted,
        completionRate: scoredTotal > 0 ? Math.round((scoredCompleted / scoredTotal) * 100) : 0,
        scheduleSwitched,
        blocks,
      };
    });

    const months: RoutineProgressResponse['months'] = [];
    if (period === 'year') {
      for (let monthIndex = 1; monthIndex <= 12; monthIndex++) {
        const month = `${anchorYear}-${String(monthIndex).padStart(2, '0')}`;
        const monthDays = days.filter((day) => day.date.startsWith(month));
        const scheduled = monthDays.filter((day) => day.scheduled);
        months.push({
          month,
          scheduledDays: scheduled.length,
          averageCompletionRate:
            scheduled.length > 0
              ? Math.round(
                  scheduled.reduce((sum, day) => sum + day.completionRate, 0) / scheduled.length,
                )
              : 0,
        });
      }
    }

    return {
      period,
      anchorDate: anchor,
      startDate,
      endDate,
      label,
      days,
      months,
    };
  }

  /**
   * Create routine template
   */
  async createTemplate(
    userId: string,
    input: CreateRoutineTemplateInput & {
      description?: string;
      color?: string;
      icon?: string;
    },
  ): Promise<RoutineTemplateWithBlocks | RoutineTemplate> {
    if (!input.name?.trim()) {
      throw new Error('Template name is required');
    }

    const isDefault = input.isDefault ?? false;

    // "One default template per day type" is enforced here, atomically, so the
    // exclusivity rule has exactly one implementation.
    const template = await this.routineRepository.createTemplateWithDefaultFlag(
      userId,
      {
        user: { connect: { id: userId } },
        name: input.name.trim(),
        description: input.description,
        dayType: input.dayType,
        isDefault,
        isActive: true,
        color: input.color,
        icon: input.icon,
      } as Prisma.RoutineTemplateCreateInput,
      isDefault,
      input.dayType,
    );

    return template;
  }

  /**
   * All templates for a user, with block counts, in display order.
   */
  async listTemplates(userId: string) {
    return this.routineRepository.findAllTemplates(userId, true);
  }

  /**
   * Create a template from a minimal { name, dayType, isDefault } payload.
   * Used by the day-type-scoped templates endpoint.
   */
  async createSimpleTemplate(
    userId: string,
    input: { name: string; dayType: DayType; isDefault?: boolean },
  ) {
    return this.createTemplate(userId, {
      name: input.name,
      dayType: input.dayType,
      isDefault: input.isDefault ?? false,
    });
  }

  /**
   * Update a template's name and/or default flag, preserving the
   * one-default-per-day-type rule.
   */
  async updateTemplate(
    userId: string,
    templateId: string,
    input: { name?: string; isDefault?: boolean },
  ) {
    const existing = await this.routineRepository.findTemplateById(templateId, userId);
    if (!existing) {
      throw new Error('Routine template not found');
    }

    const isDefault = input.isDefault === undefined ? existing.isDefault : input.isDefault;
    const name =
      typeof input.name === 'string' && input.name.trim() ? input.name.trim() : undefined;

    const template = await this.routineRepository.updateTemplateWithDefaultFlag(
      templateId,
      userId,
      {
        ...(name !== undefined && { name }),
        isDefault,
      },
      isDefault,
      existing.dayType,
    );

    return template;
  }

  // ==========================================================================
  // Routine exceptions
  // ==========================================================================

  /**
   * List a user's routine exceptions, optionally for a single date.
   */
  async listExceptions(userId: string, date?: string) {
    return this.routineRepository.listExceptions(userId, date);
  }

  /**
   * The user's day-type definitions, excluding archived ones.
   *
   * This is the list a day-type picker needs: the six built-in enum values are
   * not enough, because every user-defined day type ("College Day", …) lives
   * here and collapses to `CUSTOM` in the enum.
   */
  async listDayTypes(userId: string) {
    return this.routineRepository.listDayTypeDefinitions(userId);
  }

  /**
   * Create or replace the per-date routine exception.
   *
   * Verifies the referenced template belongs to the user before writing, so an
   * exception can never point at somebody else's template.
   */
  async upsertException(
    userId: string,
    input: {
      date: string;
      dayType: DayType;
      /** Links a *custom* day type so it is not collapsed into `CUSTOM`. */
      dayTypeId?: string | null;
      templateId?: string | null;
      note?: string | null;
    },
  ) {
    if (input.templateId) {
      const template = await this.routineRepository.findTemplateById(input.templateId, userId);
      if (!template) {
        throw new Error('Routine template not found');
      }
    }

    // Ownership check: an exception must never point at another user's day type.
    if (input.dayTypeId) {
      const definition = await this.routineRepository.listDayTypeDefinitions(userId);
      if (!definition.some((d) => d.id === input.dayTypeId)) {
        throw new Error('Day type not found');
      }
    }

    const exception = await this.routineRepository.upsertException(userId, input.date, {
      dayType: input.dayType,
      dayTypeId: input.dayTypeId ?? null,
      templateId: input.templateId ?? null,
      note: input.note?.trim() || null,
    });

    return exception;
  }

  /**
   * Clear the per-date override, returning the date to its natural schedule.
   */
  async clearException(userId: string, date: string) {
    await this.routineRepository.deleteExceptionsForDate(userId, date);
  }

  /**
   * Record a routine block's status for a date.
   *
   * Verifies block ownership before writing the log.
   */
  async logBlockStatus(
    userId: string,
    input: {
      blockId: string;
      date: string;
      status: RoutineLogStatus;
      note?: string | null;
    },
  ) {
    const block = await this.routineRepository.findBlockById(input.blockId, userId);
    if (!block) {
      throw new Error('Routine block not found');
    }

    return this.routineRepository.upsertLog(userId, input.blockId, input.date, {
      status: input.status,
      note: input.note ?? null,
    });
  }

  /**
   * Add block to template
   */
  async addBlock(
    userId: string,
    templateId: string,
    input: CreateRoutineBlockInput & {
      notes?: string;
      color?: string;
      icon?: string;
      energyLevel?: string;
      trackCompletion?: boolean;
      isRecurring?: boolean;
      sortOrder?: number;
    },
  ): Promise<RoutineBlock> {
    // Verify template ownership
    const template = await this.routineRepository.findTemplateById(templateId, userId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(input.startTime)) {
      throw new Error('Start time must be in HH:mm format');
    }
    if (!/^\d{2}:\d{2}$/.test(input.endTime)) {
      throw new Error('End time must be in HH:mm format');
    }

    // Check for conflicts with existing blocks
    const existingBlocks = await this.routineRepository.findBlocksByTemplate(templateId);
    const conflicts = existingBlocks.filter((block) =>
      isTimeOverlap(block.startTime, block.endTime, input.startTime, input.endTime),
    );

    if (conflicts.length > 0) {
      throw new Error('Time conflicts with existing blocks');
    }

    // Create block
    const block = await this.routineRepository.createBlock({
      user: { connect: { id: userId } },
      template: { connect: { id: templateId } },
      startTime: input.startTime,
      endTime: input.endTime,
      title: input.title,
      description: input.description,
      notes: input.notes,
      color: input.color,
      icon: input.icon,
      category: input.categoryId ? { connect: { id: input.categoryId } } : undefined,
      energyLevel: input.energyLevel,
      trackCompletion: input.trackCompletion ?? false,
      isRecurring: input.isRecurring ?? true,
      sortOrder: input.sortOrder ?? 0,
      isOvernight: isOvernightBlock(input.startTime, input.endTime),
    } as Prisma.RoutineBlockCreateInput);

    return block;
  }

  /**
   * Update a routine block.
   *
   * Ownership is checked against the block's *own* template, and the URL's
   * template id is verified to match, so a block cannot be written through
   * another template's path.
   */
  async updateBlock(
    userId: string,
    templateId: string,
    blockId: string,
    input: {
      title?: string;
      description?: string | null;
      startTime?: string;
      endTime?: string;
      color?: string | null;
      icon?: string | null;
      energyLevel?: string | null;
      trackCompletion?: boolean;
      /** Explicit ordering. Previously absent, so reorder requests were dropped. */
      sortOrder?: number;
    },
  ): Promise<RoutineBlock> {
    const block = await this.routineRepository.findBlockByIdForService(blockId);
    if (!block || block.template?.userId !== userId) {
      throw new Error('Block not found');
    }
    if (block.templateId !== templateId) {
      throw new Error('Block belongs to a different template');
    }

    const data: Prisma.RoutineBlockUpdateInput = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.color !== undefined) data.color = input.color;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.energyLevel !== undefined) data.energyLevel = input.energyLevel;
    if (input.trackCompletion !== undefined) data.trackCompletion = input.trackCompletion;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    if (input.startTime !== undefined || input.endTime !== undefined) {
      const startTime = input.startTime ?? block.startTime;
      const endTime = input.endTime ?? block.endTime;

      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
        throw new Error('Times must be in HH:mm format');
      }

      // Reject an overlap the same way `addBlock` does, otherwise a resize can
      // silently create an unrenderable timetable.
      const siblings = (await this.routineRepository.findBlocksByTemplate(templateId)).filter(
        (b) => b.id !== blockId,
      );
      const clash = siblings.find((b) =>
        isTimeOverlap(b.startTime, b.endTime, startTime, endTime),
      );
      if (clash) {
        throw new Error(`Time conflicts with "${clash.title}"`);
      }

      data.startTime = startTime;
      data.endTime = endTime;
      // An overnight block is implied by the times, so it cannot drift.
      data.isOvernight = isOvernightBlock(startTime, endTime);
    }

    return this.routineRepository.updateBlock(blockId, userId, data);
  }

  /**
   * Swap two blocks' `sortOrder` within a template.
   *
   * Both writes run in one transaction: a partial swap would leave two blocks
   * sharing a `sortOrder`, and the notification scheduler explicitly notes
   * that nothing enforces the uniqueness of this field.
   */
  async reorderBlock(
    userId: string,
    templateId: string,
    blockId: string,
    peerId: string,
  ): Promise<RoutineBlock[]> {
    const template = await this.routineRepository.findTemplateById(templateId, userId);
    if (!template) {
      throw new Error('Template not found');
    }
    if (blockId === peerId) {
      throw new Error('Cannot reorder a block relative to itself');
    }

    const blocks = await this.routineRepository.findBlocksByTemplate(templateId);
    const block = blocks.find((b) => b.id === blockId);
    const peer = blocks.find((b) => b.id === peerId);

    if (!block || !peer) {
      throw new Error('Block not found');
    }

    return this.routineRepository.swapBlockOrder(userId, blockId, peerId);
  }

  /**
   * Delete a routine block, verifying ownership via its template.
   */
  async deleteBlock(userId: string, templateId: string, blockId: string) {
    const block = await this.routineRepository.findBlockByIdForService(blockId);
    if (!block || block.template?.userId !== userId) {
      throw new Error('Block not found');
    }
    if (block.templateId !== templateId) {
      throw new Error('Block belongs to a different template');
    }
    return this.routineRepository.deleteBlock(blockId, userId);
  }

  /**
   * Log routine block completion
   */
  async logBlockCompletion(
    userId: string,
    blockId: string,
    date: string,
    status: string,
    data?: {
      actualStartTime?: string;
      actualEndTime?: string;
      focusRating?: number;
      productivityRating?: number;
      energyLevel?: number;
      note?: string;
    },
  ): Promise<RoutineLog> {
    // Verify block ownership
    const block = await this.routineRepository.findBlockById(blockId, userId);
    if (!block) {
      throw new Error('Block not found');
    }

    // Calculate actual duration if times provided
    let durationMinutes: number | null = null;
    if (data?.actualStartTime && data?.actualEndTime) {
      const [startHour = 0, startMin = 0] = data.actualStartTime.split(':').map(Number);
      const [endHour = 0, endMin = 0] = data.actualEndTime.split(':').map(Number);
      const startTotalMin = startHour * 60 + startMin;
      const endTotalMin = endHour * 60 + endMin;
      // A completion that runs past midnight (e.g. 23:30 -> 00:30) is a
      // positive 60 minutes, not -1380. Roll the end time forward a day when
      // it lands before the start.
      const elapsed = endTotalMin - startTotalMin;
      durationMinutes = elapsed < 0 ? elapsed + 24 * 60 : elapsed;
    }

    const log = await this.routineRepository.upsertLog(userId, blockId, date, {
      status: status as RoutineLogStatus,
      actualStartTime: data?.actualStartTime,
      actualEndTime: data?.actualEndTime,
      durationMinutes,
      focusRating: data?.focusRating,
      productivityRating: data?.productivityRating,
      energyLevel: data?.energyLevel,
      note: data?.note,
    });

    // Routine completion feeds routineCompletionRate on the daily score, so the
    // score (and every consumer of it) must be recomputed for this date.
    const { ScoringService } = await import('./scoring.service');
    await new ScoringService().calculateDailyScore(userId, date);

    return log;
  }

  /**
   * Get routine analytics
   */
  async getRoutineAnalytics(
    userId: string,
    templateId: string,
    startDate: string,
    endDate: string,
  ): Promise<RoutineAnalytics> {
    // Verify template ownership
    const template = await this.routineRepository.findTemplateWithBlocks(templateId, userId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Get logs for period
    const logs = await this.findLogsForRange(userId, startDate, endDate);
    const blockLogMap = new Map<string, RoutineLog[]>();
    for (const log of logs) {
      const blockLogs = blockLogMap.get(log.routineBlockId) ?? [];
      blockLogs.push(log);
      blockLogMap.set(log.routineBlockId, blockLogs);
    }

    const blocks = template.blocks;
    const totalBlocks = blocks.length;
    const trackedBlocks = blocks.filter((b) => b.trackCompletion).length;

    const completedCount = logs.filter((l) => l.status === 'COMPLETED').length;
    const partialCount = logs.filter((l) => l.status === 'PARTIAL').length;
    const missedCount = logs.filter((l) => l.status === 'MISSED').length;

    return {
      templateId,
      templateName: template.name,
      period: { startDate, endDate },
      totalBlocks,
      trackedBlocks,
      completion: {
        totalLogs: logs.length,
        completedLogs: completedCount,
        partialLogs: partialCount,
        missedLogs: missedCount,
        completionRate: logs.length > 0 ? Math.round((completedCount / logs.length) * 100) : null,
      },
      blocks: blocks.map((block) => {
        const blockLogs = blockLogMap.get(block.id) ?? [];
        const blockCompleted = blockLogs.filter((l) => l.status === 'COMPLETED').length;

        return {
          id: block.id,
          title: block.title,
          tracked: block.trackCompletion,
          duration: calculateBlockDuration(block.startTime, block.endTime),
          logCount: blockLogs.length,
          completionRate:
            blockLogs.length > 0 ? Math.round((blockCompleted / blockLogs.length) * 100) : null,
        };
      }),
    };
  }

  /**
   * Fetch routine logs for a date range (inclusive), one day at a time
   */
  private async findLogsForRange(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<RoutineLog[]> {
    const logs: RoutineLog[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start.getTime() > end.getTime()) {
      return logs;
    }

    const current = new Date(start);
    while (current.getTime() <= end.getTime()) {
      const dateStr = current.toISOString().slice(0, 10);
      logs.push(...(await this.routineRepository.findLogsByDate(userId, dateStr)));
      current.setDate(current.getDate() + 1);
    }

    return logs;
  }
}
