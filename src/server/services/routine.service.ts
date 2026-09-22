import type { DayType, Prisma, RoutineLog } from '@prisma/client';
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
} from '@/types/routine';
import { getDayTypeForDate } from '@/constants/routine';
import {
  isOvernightBlock,
  isTimeOverlap,
  calculateBlockDuration,
} from '@/lib/routine/duration';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { getPeriodRange } from '@/lib/period-range';
import { UserRepository } from '@/server/repositories/user.repository';

/**
 * Routine Service
 * Business logic for routine management
 */

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
  async getRoutineForDate(
    userId: string,
    date: Date | string
  ): Promise<DayRoutine> {
    const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
    const dateObj = new Date(dateStr);

    // Check for exception
    const exception = await this.routineRepository.findException(userId, dateStr);

    let dayType: DayType = getDayTypeForDate(dateObj);
    let templateId: string | null = null;

    if (exception) {
      dayType = exception.dayType;
      templateId = exception.templateId;
    }

    // Get template
    let template: RoutineTemplateWithBlocks | null = null;
    if (templateId) {
      template = (await this.routineRepository.findTemplateWithBlocks(templateId, userId)) as
        | RoutineTemplateWithBlocks
        | null;
    } else {
      template = (await this.routineRepository.findTemplateByDayType(userId, dayType)) as
        | RoutineTemplateWithBlocks
        | null;
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
      };
    }

    // Get logs for the date
    const logs = await this.routineRepository.findLogsByDate(userId, dateStr);
    const logMap = new Map(logs.map(log => [log.routineBlockId, log]));

    // Build blocks with logs
    const blocks = template.blocks.map(block => ({
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
          }
        : null,
      energyLevel: block.energyLevel,
      trackCompletion: block.trackCompletion,
      durationMinutes: calculateBlockDuration(block.startTime, block.endTime),
      isOvernight: isOvernightBlock(block.startTime, block.endTime),
      log: logMap.get(block.id) || null,
    }));

    const completedBlocks = logs.filter(log => log.status === 'COMPLETED').length;

    return {
      date: dateStr,
      dayType,
      template,
      exception,
      blocks: blocks as any,
      totalBlocks: blocks.length,
      completedBlocks,
      completionRate:
        blocks.length > 0 ? Math.round((completedBlocks / blocks.length) * 100) : 0,
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
    anchorDate?: string
  ): Promise<RoutineProgressResponse> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const anchor = anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(anchorDate)
      ? anchorDate
      : getTodayString(timezone);
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

    const templatesByDayType = new Map<DayType, RoutineTemplateWithBlocks>();
    for (const template of templates as RoutineTemplateWithBlocks[]) {
      if (!templatesByDayType.has(template.dayType)) {
        templatesByDayType.set(template.dayType, template);
      }
    }
    const templatesById = new Map<string, RoutineTemplateWithBlocks>();
    for (const template of templates as RoutineTemplateWithBlocks[]) {
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

    const allDays = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate),
    }).map((day) => format(day, 'yyyy-MM-dd'));

    const days: RoutineProgressDay[] = allDays.map((date) => {
      const exception = exceptionsByDate.get(date);
      let dayType: DayType | null = null;
      let template: RoutineTemplateWithBlocks | undefined;

      if (exception) {
        dayType = exception.dayType;
        template = exception.templateId
          ? templatesById.get(exception.templateId)
          : templatesByDayType.get(dayType);
      } else {
        dayType = getDayTypeForDate(parseISO(date));
        template = templatesByDayType.get(dayType);
      }

      if (!dayType || !template) {
        return {
          date,
          dayType: dayType ?? 'CUSTOM' as DayType,
          scheduled: false,
          total: 0,
          completed: 0,
          completionRate: 0,
          blocks: [],
        };
      }

      const blocks = template.blocks.map((block) => ({
        blockId: block.id,
        title: block.title,
        startTime: block.startTime,
        endTime: block.endTime,
        status: (statusByKey.get(`${date}::${block.id}`) ?? null) as RoutineLog['status'],
      }));

      const completed = blocks.filter((block) => block.status === 'COMPLETED').length;

      return {
        date,
        dayType,
        scheduled: blocks.length > 0,
        total: blocks.length,
        completed,
        completionRate: blocks.length > 0
          ? Math.round((completed / blocks.length) * 100)
          : 0,
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
          averageCompletionRate: scheduled.length > 0
            ? Math.round(
                scheduled.reduce((sum, day) => sum + day.completionRate, 0) / scheduled.length
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
    }
  ): Promise<any> {
    if (!input.name?.trim()) {
      throw new Error('Template name is required');
    }

    const template = await this.routineRepository.createTemplate({
      user: { connect: { id: userId } },
      name: input.name,
      description: input.description,
      dayType: input.dayType,
      isDefault: input.isDefault ?? false,
      isActive: true,
      color: input.color,
      icon: input.icon,
    } as Prisma.RoutineTemplateCreateInput);

    return template;
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
    }
  ): Promise<any> {
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
    const conflicts = existingBlocks.filter(block =>
      isTimeOverlap(block.startTime, block.endTime, input.startTime, input.endTime)
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
    }
  ): Promise<any> {
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
      durationMinutes = endTotalMin - startTotalMin;
    }

    const log = await this.routineRepository.createLog({
      user: { connect: { id: userId } },
      routineBlock: { connect: { id: blockId } },
      date,
      status,
      actualStartTime: data?.actualStartTime,
      actualEndTime: data?.actualEndTime,
      durationMinutes,
      focusRating: data?.focusRating,
      productivityRating: data?.productivityRating,
      energyLevel: data?.energyLevel,
      note: data?.note,
    } as Prisma.RoutineLogCreateInput);

    return log;
  }

  /**
   * Get routine analytics
   */
  async getRoutineAnalytics(
    userId: string,
    templateId: string,
    startDate: string,
    endDate: string
  ): Promise<any> {
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
    const trackedBlocks = blocks.filter(b => b.trackCompletion).length;

    const completedCount = logs.filter(l => l.status === 'COMPLETED').length;
    const partialCount = logs.filter(l => l.status === 'PARTIAL').length;
    const missedCount = logs.filter(l => l.status === 'MISSED').length;

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
        completionRate:
          logs.length > 0 ? Math.round((completedCount / logs.length) * 100) : null,
      },
      blocks: blocks.map(block => {
        const blockLogs = blockLogMap.get(block.id) ?? [];
        const blockCompleted = blockLogs.filter(l => l.status === 'COMPLETED').length;

        return {
          id: block.id,
          title: block.title,
          tracked: block.trackCompletion,
          duration: calculateBlockDuration(block.startTime, block.endTime),
          logCount: blockLogs.length,
          completionRate:
            blockLogs.length > 0
              ? Math.round((blockCompleted / blockLogs.length) * 100)
              : null,
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
    endDate: string
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