import prisma from '@/lib/prisma';
import { DayType, PlanStatus } from '@/generated/prisma';
import { getTodayString, shiftCalendarDay, DEFAULT_TZ } from '@/lib/dates';
import { RoutineRepository } from '@/server/repositories/routine.repository';

const routineRepository = new RoutineRepository();

export interface TomorrowPlanView {
  id: string;
  date: string;
  dayTypeId: string | null;
  dayType: DayType;
  status: PlanStatus;
  isManual: boolean;
  selectedAt: Date | null;
  confirmedAt: Date | null;
  changedAt: Date | null;
  previousDayTypeId: string | null;
  routineVersion: number;
  notificationsScheduled: boolean;
  localSynced: boolean;
  serverSynced: boolean;
  dayTypeName?: string | null;
  dayTypeColor?: string | null;
}

export interface SelectDayTypeInput {
  dayTypeId: string;
}

export interface ConfirmPlanInput {
  dayTypeId: string;
}

export interface ChangePlanInput {
  dayTypeId: string;
}

export interface PlanResult {
  plan: TomorrowPlanView;
  action: 'created' | 'selected' | 'confirmed' | 'changed' | 'fallback_applied';
  routineGenerated: boolean;
  notificationsScheduled: number;
}

export class DayTypePlanningService {
  /**
   * Get tomorrow's plan for the user.
   * Creates a PENDING plan if none exists.
   */
  async getTomorrowPlan(userId: string): Promise<TomorrowPlanView | null> {
    const timezone = await this.getUserTimezone(userId);
    const tomorrow = shiftCalendarDay(getTodayString(timezone), 1);

    let plan = await prisma.tomorrowDayTypePlan.findUnique({
      where: { userId_date: { userId, date: new Date(tomorrow) } },
    });

    if (!plan) {
      plan = await this.createPendingPlan(userId, tomorrow);
    }

    return this.enrichPlan(plan);
  }

  /**
   * Create a pending plan for tomorrow.
   */
  private async createPendingPlan(userId: string, date: string) {
    return prisma.tomorrowDayTypePlan.create({
      data: {
        userId,
        date: new Date(date),
        dayType: DayType.CUSTOM,
        status: PlanStatus.PENDING,
        isManual: false,
      },
    });
  }

  /**
   * User selects tomorrow's DayType (but doesn't confirm yet).
   * Status changes to SELECTED.
   */
  async selectTomorrowDayType(userId: string, input: SelectDayTypeInput): Promise<PlanResult> {
    const timezone = await this.getUserTimezone(userId);
    const tomorrow = shiftCalendarDay(getTodayString(timezone), 1);

    // Verify the day type belongs to the user
    const definition = await prisma.dayTypeDefinition.findFirst({
      where: { id: input.dayTypeId, userId },
    });

    if (!definition) {
      throw new Error('Day type not found');
    }

    // Get or create plan
    let plan = await prisma.tomorrowDayTypePlan.findUnique({
      where: { userId_date: { userId, date: new Date(tomorrow) } },
    });

    if (!plan) {
      plan = await this.createPendingPlan(userId, tomorrow);
    }

    // Update with selection
    const updated = await prisma.tomorrowDayTypePlan.update({
      where: { id: plan.id },
      data: {
        dayTypeId: input.dayTypeId,
        dayType: definition.slug === 'work-day' ? DayType.WORKDAY :
                 definition.slug === 'weekend' ? DayType.WEEKEND :
                 definition.slug === 'holiday' ? DayType.HOLIDAY :
                 definition.slug === 'exam-day' ? DayType.EXAM_DAY :
                 definition.slug === 'low-energy' ? DayType.LOW_ENERGY :
                 DayType.CUSTOM,
        status: PlanStatus.SELECTED,
        isManual: true,
        selectedAt: new Date(),
        previousDayTypeId: plan.dayTypeId,
        changedAt: new Date(),
      },
    });

    return {
      plan: await this.enrichPlan(updated),
      action: 'selected',
      routineGenerated: false,
      notificationsScheduled: 0,
    };
  }

  /**
   * User confirms tomorrow's DayType.
   * Generates routine blocks and schedules notifications.
   * Status changes to CONFIRMED.
   */
  async confirmTomorrowPlan(userId: string, input: ConfirmPlanInput): Promise<PlanResult> {
    const timezone = await this.getUserTimezone(userId);
    const tomorrow = shiftCalendarDay(getTodayString(timezone), 1);

    let plan = await prisma.tomorrowDayTypePlan.findUnique({
      where: { userId_date: { userId, date: new Date(tomorrow) } },
    });

    if (!plan) {
      plan = await this.createPendingPlan(userId, tomorrow);
    }

    // If no day type selected yet, use the fallback
    let dayTypeId = plan.dayTypeId;
    if (!dayTypeId) {
      dayTypeId = input.dayTypeId;
    }

    // Verify the day type
    const definition = await prisma.dayTypeDefinition.findFirst({
      where: { id: dayTypeId, userId },
    });

    if (!definition) {
      throw new Error('Day type not found');
    }

    // Update plan to CONFIRMED
    const updated = await prisma.tomorrowDayTypePlan.update({
      where: { id: plan.id },
      data: {
        dayTypeId,
        dayType: definition.slug === 'work-day' ? DayType.WORKDAY :
                 definition.slug === 'weekend' ? DayType.WEEKEND :
                 definition.slug === 'holiday' ? DayType.HOLIDAY :
                 definition.slug === 'exam-day' ? DayType.EXAM_DAY :
                 definition.slug === 'low-energy' ? DayType.LOW_ENERGY :
                 DayType.CUSTOM,
        status: PlanStatus.CONFIRMED,
        isManual: true,
        confirmedAt: new Date(),
        previousDayTypeId: plan.dayTypeId,
        routineVersion: (plan.routineVersion || 0) + 1,
      },
    });

    // Generate routine and schedule notifications
    let routineGenerated = false;
    let notificationsScheduled = 0;

    try {
      const { scheduleAllReminders } = await import('@/server/notifications/schedule-all');
      const result = await scheduleAllReminders(new Date(tomorrow + 'T00:00:00'));
      notificationsScheduled = result.routineNotificationsScheduled;
      routineGenerated = true;
    } catch (error) {
      console.error('Failed to schedule tomorrow notifications:', error);
    }

    // Mark notifications as scheduled
    await prisma.tomorrowDayTypePlan.update({
      where: { id: updated.id },
      data: { notificationsScheduled: true },
    });

    return {
      plan: await this.enrichPlan(updated),
      action: 'confirmed',
      routineGenerated,
      notificationsScheduled,
    };
  }

  /**
   * User changes tomorrow's DayType after confirmation.
   * Regenerates routine and reschedules notifications.
   */
  async changeTomorrowPlan(userId: string, input: ChangePlanInput): Promise<PlanResult> {
    const timezone = await this.getUserTimezone(userId);
    const tomorrow = shiftCalendarDay(getTodayString(timezone), 1);

    const plan = await prisma.tomorrowDayTypePlan.findUnique({
      where: { userId_date: { userId, date: new Date(tomorrow) } },
    });

    if (!plan) {
      throw new Error('No plan exists for tomorrow');
    }

    // Verify the day type
    const definition = await prisma.dayTypeDefinition.findFirst({
      where: { id: input.dayTypeId, userId },
    });

    if (!definition) {
      throw new Error('Day type not found');
    }

    // Update plan
    const updated = await prisma.tomorrowDayTypePlan.update({
      where: { id: plan.id },
      data: {
        dayTypeId: input.dayTypeId,
        dayType: definition.slug === 'work-day' ? DayType.WORKDAY :
                 definition.slug === 'weekend' ? DayType.WEEKEND :
                 definition.slug === 'holiday' ? DayType.HOLIDAY :
                 definition.slug === 'exam-day' ? DayType.EXAM_DAY :
                 definition.slug === 'low-energy' ? DayType.LOW_ENERGY :
                 DayType.CUSTOM,
        status: PlanStatus.CONFIRMED,
        isManual: true,
        confirmedAt: new Date(),
        previousDayTypeId: plan.dayTypeId,
        changedAt: new Date(),
        routineVersion: (plan.routineVersion || 0) + 1,
        notificationsScheduled: false,
      },
    });

    // Regenerate routine and reschedule notifications
    let routineGenerated = false;
    let notificationsScheduled = 0;

    try {
      // Cancel old notifications first
      await this.cancelTomorrowNotifications(userId, tomorrow);

      const { scheduleAllReminders } = await import('@/server/notifications/schedule-all');
      const result = await scheduleAllReminders(new Date(tomorrow + 'T00:00:00'));
      notificationsScheduled = result.routineNotificationsScheduled;
      routineGenerated = true;
    } catch (error) {
      console.error('Failed to reschedule tomorrow notifications:', error);
    }

    // Mark notifications as scheduled
    await prisma.tomorrowDayTypePlan.update({
      where: { id: updated.id },
      data: { notificationsScheduled: true },
    });

    return {
      plan: await this.enrichPlan(updated),
      action: 'changed',
      routineGenerated,
      notificationsScheduled,
    };
  }

  /**
   * Apply fallback DayType if no plan was confirmed by midnight.
   * This should be called by a cron job at midnight.
   */
  async applyFallbackIfNeeded(userId: string): Promise<PlanResult | null> {
    const timezone = await this.getUserTimezone(userId);
    const tomorrow = shiftCalendarDay(getTodayString(timezone), 1);

    const plan = await prisma.tomorrowDayTypePlan.findUnique({
      where: { userId_date: { userId, date: new Date(tomorrow) } },
    });

    if (!plan || plan.status === PlanStatus.CONFIRMED || plan.status === PlanStatus.SYNCED) {
      return null;
    }

    // Determine fallback DayType based on weekday
    const [year, month, day] = tomorrow.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay();
    const fallbackDayType = (weekday === 0 || weekday === 6) ? DayType.WEEKEND : DayType.WORKDAY;

    const definition = await prisma.dayTypeDefinition.findFirst({
      where: { userId, slug: fallbackDayType === DayType.WEEKEND ? 'weekend' : 'work-day' },
    });

    const dayTypeId = definition?.id;

    const updated = await prisma.tomorrowDayTypePlan.update({
      where: { id: plan.id },
      data: {
        dayTypeId,
        dayType: fallbackDayType,
        status: PlanStatus.FALLBACK_APPLIED,
        isManual: false,
        confirmedAt: new Date(),
        previousDayTypeId: plan.dayTypeId,
        routineVersion: (plan.routineVersion || 0) + 1,
      },
    });

    // Generate routine and schedule notifications
    let routineGenerated = false;
    let notificationsScheduled = 0;

    try {
      const { scheduleAllReminders } = await import('@/server/notifications/schedule-all');
      const result = await scheduleAllReminders(new Date(tomorrow + 'T00:00:00'));
      notificationsScheduled = result.routineNotificationsScheduled;
      routineGenerated = true;
    } catch (error) {
      console.error('Failed to schedule fallback notifications:', error);
    }

    await prisma.tomorrowDayTypePlan.update({
      where: { id: updated.id },
      data: { notificationsScheduled: true },
    });

    return {
      plan: await this.enrichPlan(updated),
      action: 'fallback_applied',
      routineGenerated,
      notificationsScheduled,
    };
  }

  /**
   * Cancel all scheduled notifications for tomorrow.
   */
  private async cancelTomorrowNotifications(userId: string, date: string): Promise<void> {
    // Mark all pending notifications for tomorrow as dismissed
    const types = [
      'ROUTINE_PRE_START',
      'ROUTINE_START',
      'ROUTINE_COMPLETION',
      'ROUTINE_END_REMINDER',
      'HABIT_REMINDER',
      'GOAL_DEADLINE',
    ];

    for (const type of types) {
      await prisma.notificationLog.updateMany({
        where: {
          userId,
          type: type as any,
          scheduledFor: {
            gte: new Date(date + 'T00:00:00'),
            lt: new Date(date + 'T23:59:59'),
          },
          status: 'PENDING',
        },
        data: {
          status: 'DISMISSED',
        },
      });
    }
  }

  /**
   * Get all user's DayTypeDefinitions for the selector.
   */
  async getAvailableDayTypes(userId: string) {
    return prisma.dayTypeDefinition.findMany({
      where: { userId, isArchived: false },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        icon: true,
        isDefault: true,
      },
    });
  }

  private async getUserTimezone(userId: string): Promise<string> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    return settings?.timezone || DEFAULT_TZ;
  }

  private async enrichPlan(plan: any): Promise<TomorrowPlanView> {
    let dayTypeName: string | null = null;
    let dayTypeColor: string | null = null;

    if (plan.dayTypeId) {
      const def = await prisma.dayTypeDefinition.findUnique({
        where: { id: plan.dayTypeId },
        select: { name: true, color: true },
      });
      dayTypeName = def?.name ?? null;
      dayTypeColor = def?.color ?? null;
    }

    return {
      ...plan,
      date: plan.date.toISOString().split('T')[0],
      dayTypeName,
      dayTypeColor,
      selectedAt: plan.selectedAt?.toISOString() ?? null,
      confirmedAt: plan.confirmedAt?.toISOString() ?? null,
      changedAt: plan.changedAt?.toISOString() ?? null,
    };
  }
}

export const dayTypePlanningService = new DayTypePlanningService();