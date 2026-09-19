import type { DayType, Prisma, RoutineLog } from '@prisma/client';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import type {
  DayRoutine,
  CreateRoutineTemplateInput,
  CreateRoutineBlockInput,
} from '@/types/routine';
import { getDayTypeForDate } from '@/constants/routine';
import {
  isOvernightBlock,
  isTimeOverlap,
  calculateBlockDuration,
} from '@/lib/routine/duration';

/**
 * Routine Service
 * Business logic for routine management
 */

export class RoutineService {
  private routineRepository: RoutineRepository;

  constructor() {
    this.routineRepository = new RoutineRepository();
  }

  /**
   * Get routine for specific date
   */
  async getRoutineForDate(
    userId: string,
    date: Date | string
  ): Promise<DayRoutine> {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
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
    let template;
    if (templateId) {
      template = await this.routineRepository.findTemplateWithBlocks(templateId, userId);
    } else {
      template = await this.routineRepository.findTemplateByDayType(userId, dayType);
    }

    if (!template) {
      return {
        date: dateStr,
        dayType,
        isException: !!exception,
        template: null,
        blocks: [],
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

    return {
      date: dateStr,
      dayType,
      isException: !!exception,
      template: {
        id: template.id,
        name: template.name,
        dayType: template.dayType,
        blocks: blocks as any,
      },
      blocks: blocks as any,
    };
  }

  /**
   * Create routine template
   */
  async createTemplate(
    userId: string,
    input: CreateRoutineTemplateInput
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
    input: CreateRoutineBlockInput
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
      const [startHour, startMin] = data.actualStartTime.split(':').map(Number);
      const [endHour, endMin] = data.actualEndTime.split(':').map(Number);
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
      const dateStr = current.toISOString().split('T')[0];
      logs.push(...(await this.routineRepository.findLogsByDate(userId, dateStr)));
      current.setDate(current.getDate() + 1);
    }

    return logs;
  }
}