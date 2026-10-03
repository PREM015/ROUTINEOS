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
import { isOvernightBlock, calculateBlockDuration } from '@/lib/routine/duration';
import { overlapMinutes } from '@/lib/routine/conflicts';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { getPeriodRange } from '@/lib/period-range';
import { UserRepository } from '@/server/repositories/user.repository';
import { CategoryRepository } from '@/server/repositories/category.repository';
import {
  EditWindowError,
  evaluateEditWindow,
  resolveRetroactiveEditDays,
  type EditWindowDecision,
} from '@/lib/routine/edit-window';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { ScoringService } from '@/server/services/scoring.service';
import { toUserId, type UserId } from '@/types/ids';

  /**
 * A log write needs a status; only the `clear` path may omit it.
 *
 * Split out so the check reads as one line at the call site instead of an inline
 * conditional inside the payload literal.
 */
function requireStatus(input: { status?: RoutineLogStatus }): RoutineLogStatus {
  if (!input.status) {
    throw new ValidationError('status is required unless clear is set');
  }
  return input.status;
}

/**
 * Does this block belong to `userId`?
 *
 * Prefers the joined template but falls back to the block's own `userId`: both
 * are user-scoped and either one alone is enough to refuse a foreign block, while
 * requiring the join would reject a valid write whenever the relation is not
 * selected.
 */
function isOwnedByUser<T extends { userId?: string | null; template?: { userId?: string | null } | null }>(
  block: T | null | undefined,
  userId: UserId,
): block is T {
  if (!block) return false;
  return (block.userId ?? block.template?.userId) === userId;
}

/**
 * A non-blocking advisory returned alongside a successful block write.
 *
 * Overlaps are legal in a timetable — a block may legitimately span a boundary —
 * so the create/update routes answer 201/200 with the write succeeded *and* a
 * `warnings` array for the client to surface. Rejecting the write instead would
 * make those timetables unbuildable.
 */
export interface RoutineOverlapWarning {
  code: 'OVERLAP';
  blockId: string;
  title: string;
  /** How many minutes the two blocks actually share, not just that they touch. */
  overlapMinutes: number;
  message: string;
}

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
  private categoryRepository: CategoryRepository;

  constructor() {
    this.routineRepository = new RoutineRepository();
    this.userRepository = new UserRepository();
    this.categoryRepository = new CategoryRepository();
  }

  /**
   * Warnings for every existing block the candidate times overlap.
   *
   * `overlapMinutes` (not `isTimeOverlap`) is the predicate because the shared
   * helper splits an overnight block into its two day segments first. The old
   * four-string comparison skipped any block whose `end` was `<=` its `start`, so
   * an evening block was saved straight through a sleep block with no warning at
   * all - the case `warns about a clash inside an existing overnight block` pins.
   *
   * Blocks that merely touch end-to-end share zero minutes and are correctly not
   * reported.
   */
  private overlapWarnings(
    existing: readonly RoutineBlock[],
    startTime: string,
    endTime: string,
    candidateTitle: string,
  ): RoutineOverlapWarning[] {
    const candidate = { startTime, endTime };
    return existing
      .map((block) => ({ block, minutes: overlapMinutes(candidate, block) }))
      .filter((entry) => entry.minutes > 0)
      .map(({ block, minutes }) => ({
        code: 'OVERLAP' as const,
        blockId: block.id,
        title: block.title,
        overlapMinutes: minutes,
        message: `"${candidateTitle || 'This block'}" overlaps "${block.title}" (${block.startTime}-${block.endTime}) by ${minutes} minute${minutes === 1 ? '' : 's'}`,
      }));
  }

  /**
   * Get routine for specific date
   */
  async getRoutineForDate(userId: UserId, date: Date | string): Promise<DayRoutine> {
    const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

    // Check for exception
    const exception = await this.routineRepository.findException(userId, dateStr);

    // Apply the shared day-type rule (exception wins, else natural weekday).
    const resolved = resolveDayTypeFromException(dateStr, 'UTC', exception);
    const dayType: DayType = resolved.dayType;

    /*
     * Resolved through the day-type *definition*, never the legacy enum column.
     * A user-defined type ("College") has no enum member at all, so the enum path
     * cannot find its template; worse, it can return a *different* template that
     * happens to share the enum value. An exception's explicit `dayTypeId` is
     * used directly, which is also why the slug lookup is skipped in that case.
     */
    const definition = resolved.dayTypeId
      ? { id: resolved.dayTypeId, name: resolved.dayTypeName ?? '' }
      : await this.routineRepository.findDayTypeDefinitionBySlug(userId, dayType);
    const dayTypeId = definition?.id ?? resolved.dayTypeId ?? null;
    const dayTypeName = definition?.name ?? resolved.dayTypeName ?? null;

    // Get template
    let template: RoutineTemplateWithBlocks | null = null;
    if (resolved.templateId) {
      template = (await this.routineRepository.findTemplateWithBlocks(
        resolved.templateId,
        userId,
      )) as RoutineTemplateWithBlocks | null;
    } else if (dayTypeId) {
      template = (await this.routineRepository.findTemplateByDayTypeId(
        userId,
        dayTypeId,
      )) as RoutineTemplateWithBlocks | null;
    } else {
      // Last resort, and only when the slug matched no definition row. The enum
      // column is the wrong key in general, but a user with legacy rows and no
      // definitions would otherwise see an empty day.
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
        dayTypeId,
        dayTypeName,
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
      dayTypeId: dayTypeId ?? template?.dayTypeId ?? null,
      dayTypeName: dayTypeName ?? template?.dayTypeDef?.name ?? null,
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
    userId: UserId,
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
    userId: UserId,
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
  async listTemplates(userId: UserId) {
    return this.routineRepository.findAllTemplates(userId, true);
  }

  /**
   * Create a template from a minimal { name, dayType, isDefault } payload.
   * Used by the day-type-scoped templates endpoint.
   */
  async createSimpleTemplate(
    userId: UserId,
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
    userId: UserId,
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
  async listExceptions(userId: UserId, date?: string) {
    return this.routineRepository.listExceptions(userId, date);
  }

  /**
   * The user's day-type definitions, excluding archived ones.
   *
   * This is the list a day-type picker needs: the six built-in enum values are
   * not enough, because every user-defined day type ("College Day", …) lives
   * here and collapses to `CUSTOM` in the enum.
   */
  async listDayTypes(userId: UserId) {
    return this.routineRepository.listDayTypeDefinitions(userId);
  }

  /**
   * Create or replace the per-date routine exception.
   *
   * Verifies the referenced template belongs to the user before writing, so an
   * exception can never point at somebody else's template.
   */
  async upsertException(
    userId: UserId,
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
  async clearException(userId: UserId, date: string) {
    await this.routineRepository.deleteExceptionsForDate(userId, date);
  }

  /**
   * Record a routine block's status for a date.
   *
   * Verifies block ownership before writing the log.
   */
  async logBlockStatus(
    userId: UserId,
    input: {
      blockId: string;
      date: string;
      status?: RoutineLogStatus;
      note?: string | null;
      actualStartTime?: string | null;
      actualEndTime?: string | null;
      focusRating?: number | null;
      productivityRating?: number | null;
      energyLevel?: number | null;
      /** Remove the day's log instead of writing a status. */
      clear?: boolean;
    },
  ) {
    const block = await this.routineRepository.findBlockById(input.blockId, userId);
    if (!block) {
      throw new NotFoundError('Routine block not found');
    }

    // Asserted before the write, not after: the route maps `EditWindowError` to a
    // 403, and a log written outside the window would have to be rolled back.
    await this.assertDateWritable(userId, input.date);

    const written = input.clear
      ? await this.tapLog(userId, input.blockId, input.date, null)
      : await this.tapLog(userId, input.blockId, input.date, {
          status: requireStatus(input),
          note: input.note ?? null,
          actualStartTime: input.actualStartTime ?? null,
          actualEndTime: input.actualEndTime ?? null,
          // Derived, never taken from the client: a completion that runs past
          // midnight is a positive duration, and `calculateBlockDuration` already
          // wraps `end <= start` over 24h rather than returning a negative.
          // Null (not zero) when the user gave no actual times, so "not recorded"
          // stays distinguishable from "took no time".
          durationMinutes:
            input.actualStartTime && input.actualEndTime
              ? calculateBlockDuration(input.actualStartTime, input.actualEndTime)
              : null,
          focusRating: input.focusRating ?? null,
          productivityRating: input.productivityRating ?? null,
          energyLevel: input.energyLevel ?? null,
        });

    return written;
  }

  /**
   * Write (or clear) one day's log, then bring the daily score back in line.
   *
   * Routine completion feeds `DailyScore.routineCompletionRate`, so the score has
   * to follow the log. Recalculation failures are swallowed deliberately: the
   * user's tick already succeeded, and turning a derived recompute into an error
   * would report a failure for something that was saved.
   */
  private async tapLog(
    userId: UserId,
    blockId: string,
    date: string,
    data: {
      status: RoutineLogStatus;
      note: string | null;
      actualStartTime: string | null;
      actualEndTime: string | null;
      durationMinutes: number | null;
      focusRating: number | null;
      productivityRating: number | null;
      energyLevel: number | null;
    } | null,
  ) {
    const log = data
      ? await this.routineRepository.upsertLog(userId, blockId, date, data)
      : await (async () => {
          await this.routineRepository.deleteLog(userId, blockId, date);
          return null;
        })();

    try {
      await new ScoringService().recalculateDate(userId, date);
    } catch {
      // See the doc comment: the write stands even if the score cannot follow it.
    }

    return log;
  }

  /**
   * Add block to template
   */
  async addBlock(
    userId: UserId,
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
  ): Promise<{ block: RoutineBlock; template: RoutineTemplate; warnings: RoutineOverlapWarning[] }> {
    // Verify template ownership
    const template = await this.routineRepository.findTemplateById(templateId, userId);
    if (!template) {
      throw new Error('Template not found');
    }

    return this.writeBlock(userId, template, input);
  }

  /**
   * The actual insert, for a caller that has *already* resolved the template.
   *
   * Split out so `createBlockForDayType` does not re-fetch a template it just
   * looked up by day type. The ownership check lives in the lookup that
   * precedes this, not here, so this method must never be called with a
   * template the caller has not already proved they own.
   */
  private async writeBlock(
    userId: UserId,
    template: RoutineTemplate,
    input: CreateRoutineBlockInput & {
      notes?: string;
      color?: string;
      icon?: string;
      energyLevel?: string;
      trackCompletion?: boolean;
      isRecurring?: boolean;
      sortOrder?: number;
    },
  ): Promise<{ block: RoutineBlock; template: RoutineTemplate; warnings: RoutineOverlapWarning[] }> {

    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(input.startTime)) {
      throw new Error('Start time must be in HH:mm format');
    }
    if (!/^\d{2}:\d{2}$/.test(input.endTime)) {
      throw new Error('End time must be in HH:mm format');
    }

    // Overlaps are advisory, not a rejection: the route answers 201 with a
    // `warnings` array, so a clash must not abort the write. Overlapping blocks
    // are a legitimate way to express a block that spans a boundary, and the
    // client renders the warning inline rather than refusing the save.
    const existingBlocks = await this.routineRepository.findBlocksByTemplate(template.id);
    const warnings = this.overlapWarnings(
      existingBlocks,
      input.startTime,
      input.endTime,
      input.title,
    );

    // Create block
    const block = await this.routineRepository.createBlock({
      user: { connect: { id: userId } },
      template: { connect: { id: template.id } },
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

    return { block, template, warnings };
  }

  /**
   * Update a routine block.
   *
   * Ownership is checked against the block's *own* template, and the URL's
   * template id is verified to match, so a block cannot be written through
   * another template's path.
   */
  async updateBlock(
    userId: UserId,
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
      /** Re-attach the block to a category the caller owns. */
      categoryId?: string | null;
      /** Detach the block from its category. Wins over `categoryId`. */
      clearCategory?: boolean;
      /**
       * Accepted from the wire and deliberately ignored.
       *
       * `isOvernight` is implied by `startTime`/`endTime`, so it is derived below
       * rather than trusted. Declaring it here keeps the type honest about what the
       * client actually sends: a resize to 22:00-06:00 must become an overnight block
       * even when the client still sends `isOvernight: false`.
       */
      isOvernight?: boolean;
    },
  ): Promise<{ block: RoutineBlock; template: RoutineTemplate; warnings: RoutineOverlapWarning[] }> {
    const block = await this.routineRepository.findBlockByIdForService(blockId);
    if (!isOwnedByUser(block, userId)) {
      throw new NotFoundError('Block not found');
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

    // Ownership-checked before the write, same as the create path: connecting by
    // id alone would let a caller attach another account's category.
    if (input.clearCategory === true) {
      data.category = { disconnect: true };
    } else if (input.categoryId) {
      const category = await this.categoryRepository.findById(input.categoryId, userId);
      if (!category) throw new NotFoundError('Category not found');
      data.category = { connect: { id: input.categoryId } };
    }

    if (input.startTime !== undefined || input.endTime !== undefined) {
      const startTime = input.startTime ?? block.startTime;
      const endTime = input.endTime ?? block.endTime;

      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
        throw new Error('Times must be in HH:mm format');
      }

      // A resize can create an overlap just as an insert can, and it is advisory
      // for the same reason `addBlock` treats it as advisory: the route returns
      // 200 with `warnings`. Collect the clashes instead of throwing, so a
      // resize to a conflicting time still saves and tells the caller why.
      const siblings = (await this.routineRepository.findBlocksByTemplate(templateId)).filter(
        (b) => b.id !== blockId,
      );
      const warnings = this.overlapWarnings(siblings, startTime, endTime, input.title ?? '');

      data.startTime = startTime;
      data.endTime = endTime;
      // An overnight block is implied by the times, so it cannot drift.
      data.isOvernight = isOvernightBlock(startTime, endTime);

      const updated = await this.routineRepository.updateBlock(blockId, userId, data);
      return { block: updated, template: block.template, warnings };
    }

    const updated = await this.routineRepository.updateBlock(blockId, userId, data);
    return { block: updated, template: block.template, warnings: [] };
  }

  /**
   * Swap two blocks' `sortOrder` within a template.
   *
   * Both writes run in one transaction: a partial swap would leave two blocks
   * sharing a `sortOrder`, and the notification scheduler explicitly notes
   * that nothing enforces the uniqueness of this field.
   */
  async reorderBlock(
    userId: UserId,
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
  async deleteBlock(userId: UserId, templateId: string, blockId: string) {
    const block = await this.routineRepository.findBlockByIdForService(blockId);
    if (!isOwnedByUser(block, userId)) {
      throw new NotFoundError('Block not found');
    }
    if (block.templateId !== templateId) {
      throw new Error('Block belongs to a different template');
    }
    return this.routineRepository.deleteBlock(blockId, userId);
  }

  /**
   * Log routine block completion
   */
  /**
   * Legacy positional form of `logBlockStatus`.
   *
   * Delegates rather than writing: this path duplicated the insert, the duration
   * maths and the recalculation, and the copies had already drifted - it called
   * `calculateDailyScore`, which with no options writes `isRestDay ?? false` and
   * so silently cleared the rest-day flag on every block completion.
   */
  async logBlockCompletion(
    userId: UserId,
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
  ): Promise<RoutineLog | null> {
    return this.logBlockStatus(userId, {
      blockId,
      date,
      status: status as RoutineLogStatus,
      actualStartTime: data?.actualStartTime ?? null,
      actualEndTime: data?.actualEndTime ?? null,
      focusRating: data?.focusRating ?? null,
      productivityRating: data?.productivityRating ?? null,
      energyLevel: data?.energyLevel ?? null,
      note: data?.note ?? null,
    });
  }

  /**
   * Get routine analytics
   */
  async getRoutineAnalytics(
    userId: UserId,
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
    userId: UserId,
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
  // ==========================================================================
  // Compatibility surface
  //
  // A refactor of this service removed the methods below while the API routes and
  // the routine page still called them, which is what left the repository with
  // ~50 compile errors and `routine-service.test.ts` failing outright. The
  // callers are the stable contract - they encode the ownership checks, the
  // response shapes and the documented 207/201/200 semantics - so the methods
  // were restored here over the repository rather than by rewriting 19 files of
  // caller intent.
  //
  // Every method here derives its template from a `userId`-scoped lookup, so
  // none of them can be used to reach another account's rows.
  // ==========================================================================

  /** One template with its blocks, or `null`. Ownership is part of the query. */
  async getTemplate(userId: UserId, templateId: string) {
    return this.routineRepository.findTemplateWithBlocks(templateId, userId);
  }

  /** Blocks of a template the caller owns, or `null` if they do not own it. */
  async getBlocks(userId: UserId, templateId: string) {
    const template = await this.routineRepository.findTemplateWithBlocks(templateId, userId);
    return template ? template.blocks : null;
  }

/**
 * Delete by id, disambiguating a block from a template.
 *
 * Both ids share one namespace on the wire, so the id is looked up as a template
 * first and only then as a block, and the resolved kind is returned.
 *
 * `only` exists because the two callers want *different* things and silently
 * picking one would be a data-loss bug in either direction. `DELETE
 * /api/routine` is the general path and deletes either kind. `DELETE
 * /api/routine/[id]` is the template path and answers 400 when handed a block
 * id - so with `only: 'template'` a block is reported and left alone, instead of
 * being deleted and *then* reported as an error.
 */
async deleteById(
    userId: UserId,
    id: string,
    date?: string | null,
    only?: 'template' | 'block',
  ): Promise<'template' | 'block'> {
    // Asserted before the kind is resolved, not inside each branch: the window is
    // a property of the requested date and applies equally to a template or a
    // block, and asserting afterwards would make the refusal order depend on which
    // table happened to answer first.
    await this.assertDateWritable(userId, date);

    // Block first, deliberately. The two ids share a namespace, and resolving the
    // template first would mean a block id that also matched a template row could
    // delete the wrong thing. A block is only ever a block to its owner, so
    // checking it first is both safer and one query cheaper in the common case.
    const block = await this.routineRepository.findBlockByIdForService(id);
    if (isOwnedByUser(block, userId)) {
      if (only === 'template') return 'block';
      await this.routineRepository.deleteBlock(id, userId);
      return 'block';
    }

    const template = await this.routineRepository.findTemplateById(id, userId);
    if (template && only !== 'block') {
      await this.routineRepository.deleteTemplate(id, userId);
      return 'template';
    }

    throw new NotFoundError('Routine template or block not found');
  }

  /**
   * Alias of `updateTemplate`, which already scopes by user.
   *
   * Both names exist because the routes predate the refactor and call the longer
   * one. This is an alias rather than a second implementation so the two names
   * cannot drift.
   */
  async updateTemplateForUser(
    userId: UserId,
    templateId: string,
    data: Parameters<RoutineService['updateTemplate']>[2],
  ) {
    return this.updateTemplate(userId, templateId, data);
  }

  /** The template a day-type preset points at, or `null`. */
  async getTemplateForDayTypeId(userId: UserId, dayTypeId: string) {
    return this.routineRepository.findTemplateByDayTypeId(toUserId(dayTypeId), userId);
  }

  /**
   * The day type to echo back for a block.
   *
   * Prefers the linked day-type definition's slug over the template's enum, so a
   * user-defined preset is not collapsed into `CUSTOM` and rendered as a second
   * identical "Custom" row.
   */
  async resolveBlockDayType(template: { dayTypeDef?: { slug?: string | null } | null; dayType?: DayType | null }) {
    return template.dayTypeDef?.slug ?? template.dayType ?? null;
  }

  /**
   * Resolve the template a block write targets, provisioning one if needed.
   *
   * Addressed by `dayTypeId` (preferred) or `dayType`, and this is deliberately
   * the *same* resolution the bulk range path uses: if the two disagreed, a
   * range could be applied to a template the single-create path would have
   * ignored.
   */
  private async resolveTemplateForDayType(
    userId: UserId,
    input: { dayTypeId?: string | null; dayType?: DayType | null; name?: string },
  ) {
    if (input.dayTypeId) {
      const found = await this.routineRepository.findTemplateByDayTypeId(toUserId(input.dayTypeId), userId);
      if (found) return found;
      const definition = await this.routineRepository.findDayTypeDefinitionById(input.dayTypeId, userId);
      if (!definition) throw new Error('Day type not found');
      return this.createSimpleTemplate(userId, {
        name: input.name ?? definition.name,
        dayType: slugToDayType(definition.slug),
      });
    }

    if (input.dayType) {
      const existing = (await this.routineRepository.findAllTemplates(userId, true)).find(
        (t) => t.dayType === input.dayType,
      );
      if (existing) return existing;
      return this.createSimpleTemplate(userId, {
        name: input.name ?? `${input.dayType} routine`,
        dayType: input.dayType,
      });
    }

    throw new Error('dayType or dayTypeId is required');
  }

  /**
   * Create a standalone block, provisioning its day-type template if absent.
   *
   * `date` is the F6 retroactive-edit context: it is not a `RoutineBlock` column,
   * and it is asserted against the user's window before anything is written so a
   * stale client cannot back-date a block into a closed window.
   */
  async createBlockForDayType(
    userId: UserId,
    input: Parameters<RoutineService['addBlock']>[2] & {
      dayTypeId?: string | null;
      dayType?: DayType | null;
      date?: string | null;
    },
  ) {
    const { date, dayTypeId, dayType, categoryId, ...block } = input;
    await this.assertDateWritable(userId, date);
    const template = await this.resolveTemplateForDayType(userId, { dayTypeId, dayType });

    // Checked before the write so a foreign category cannot leave a half-created
    // block behind. `addBlock` connects by id alone, which would otherwise let a
    // caller attach another account's category to their own block.
    if (categoryId) {
      const category = await this.categoryRepository.findById(categoryId, userId);
      if (!category) throw new Error('Category not found');
    }

    // Append after the highest slot rather than at `count`, so a block deleted
    // from the middle does not leave a hole that the next insert would fill.
    // Not queried at all when the caller named a position.
    const sortOrder =
      block.sortOrder ?? (await this.routineRepository.maxSortOrderForTemplate(template.id)) + 1;

    return this.writeBlock(userId, template, {
      ...block,
      categoryId,
      sortOrder,
    });
  }

  /**
   * Update a block by id.
   *
   * The template id is resolved from the block itself rather than taken from the
   * caller, so the ownership and same-template checks `updateBlock` performs
   * cannot be bypassed by naming a different template. `date` and
   * `clearCategory` are handled here and never forwarded as block columns.
   */
  async updateBlockForUser(
    userId: UserId,
    blockId: string,
    input: Parameters<RoutineService['updateBlock']>[3] & {
      date?: string | null;
      clearCategory?: boolean;
    },
  ) {
    const { date, ...fields } = input;
    await this.assertDateWritable(userId, date);

    // The template id is read off the block rather than taken from the caller, so
    // the same-template and ownership checks inside `updateBlock` cannot be
    // sidestepped by naming a different template. Delegating (rather than writing
    // here) is what keeps one implementation of the sibling-exclusion and the
    // `isOvernight` derivation - both of which are easy to get subtly wrong.
    const block = await this.routineRepository.findBlockByIdForService(blockId);
    if (!isOwnedByUser(block, userId)) {
      throw new NotFoundError('Routine block not found');
    }

    return this.updateBlock(userId, block.templateId, blockId, fields);
  }

  /**
   * Apply a day type's schedule across a date range.
   *
   * Reports per-date outcomes rather than a single count because the route
   * distinguishes 200 / 207 / 409 from them, and a partial write is not a
   * success. Dates that already carry an exception are skipped unless
   * `overwrite` is set, so applying a range twice is not destructive.
   */
  async applyTemplateToRange(
    userId: UserId,
    input: {
      startDate: string;
      endDate: string;
      dayTypeId?: string | null;
      dayType?: DayType | null;
      overwrite?: boolean;
      note?: string | null;
    },
  ): Promise<{ applied: string[]; skipped: { date: string; reason: string }[] }> {
    if (input.startDate > input.endDate) {
      throw new ValidationError('startDate must be on or before endDate');
    }

    const dates = eachDayOfInterval({
      start: parseISO(input.startDate),
      end: parseISO(input.endDate),
    }).map((day) => format(day, 'yyyy-MM-dd'));

    // Enforced here rather than by the schema: a range with the dates reversed or
    // unbounded is the shape a fat-fingered payload takes, and one request must
    // not be able to write a thousand exceptions.
    if (dates.length > 366) {
      throw new ValidationError('Range must not exceed 366 days');
    }

    // Not provisioned on the fly, unlike the single-block create path: applying a
    // schedule to a day type that has none would silently invent a week of empty
    // exceptions. The caller has to create the template first.
    const definition = input.dayTypeId
      ? await this.routineRepository.findDayTypeDefinitionById(input.dayTypeId, userId)
      : null;
    if (input.dayTypeId && !definition) {
      throw new NotFoundError('Day type not found');
    }

    const template = await this.routineRepository.findTemplateByDayTypeId(
      toUserId(input.dayTypeId ?? ''),
      userId,
    );
    if (!template) {
      throw new NotFoundError('Routine template not found for this day type');
    }

    const existing = new Set(
      (await this.routineRepository.listExceptions(userId)).map((row) => row.date),
    );

    const applied: string[] = [];
    const skipped: { date: string; reason: string }[] = [];

    for (const date of dates) {
      if (existing.has(date) && !input.overwrite) {
        skipped.push({ date, reason: 'An override already exists for this date' });
        continue;
      }

      // Evaluated rather than thrown: the route answers 207 with the per-date
      // breakdown, so a date outside the window is part of the result, not a
      // failure of the whole request.
      const decision = await this.evaluateDateWritable(userId, date);
      if (!decision.allowed) {
        skipped.push({ date, reason: decision.reason });
        continue;
      }

      applied.push(date);
    }

    if (applied.length > 0) {
      await this.routineRepository.upsertExceptions(
        userId,
        applied.map((date) => ({
          date,
          dayType: template.dayType,
          dayTypeId: input.dayTypeId ?? null,
          templateId: template.id,
          note: input.note ?? null,
        })),
      );
    }

    return { applied, skipped };
  }

  /**
   * Assert a target date is inside the user's retroactive edit window.
   *
   * A `null` date means "no date in play" and is always allowed - a template or
   * block edit that is not date-scoped cannot be retroactive.
   */
  private async assertDateWritable(userId: UserId, date?: string | null): Promise<void> {
    if (!date) return;
    await this.evaluateDateWritable(userId, date).then((decision) => {
      if (!decision.allowed) {
        throw new EditWindowError(decision.reason, decision.daysAgo, decision.retroactiveEditDays);
      }
    });
  }

  /**
   * May this date be written, as a decision rather than an exception.
   *
   * `assertDateWritable` throws, which is right for a single write. A range write
   * needs the answer per date so it can report which dates it refused and finish
   * the rest, so both go through here.
   *
   * A settings read that rejects is treated as "no window configured" rather than
   * propagated: the fallback below already decides the safe answer, and failing
   * the whole request would block today's routine over an unrelated settings
   * outage.
   */
  private async evaluateDateWritable(
    userId: UserId,
    date: string,
  ): Promise<EditWindowDecision> {
    let settings: { timezone?: string | null; retroactiveEditDays?: number | null } | null = null;
    try {
      settings = await this.userRepository.getSettings(userId);
    } catch {
      settings = null;
    }

    const timezone = settings?.timezone || DEFAULT_TZ;
    return evaluateEditWindow(
      date,
      getTodayString(timezone),
      resolveRetroactiveEditDays(settings?.retroactiveEditDays),
    );
  }
}
