import { PrismaClient } from '@prisma/client';

export interface ScheduledNotification { userId: string; type: string; title: string; body: string; scheduledFor: Date; data?: Record<string, any> }

export async function scheduleHabitReminders(userId: string, db: PrismaClient): Promise<ScheduledNotification[]> {
  const habits = (await (db as any).habit.findMany({ where: { userId } })) || [];
  return habits.map((h: any) => ({
    userId,
    type: 'habit',
    title: `Time for ${h.name}`,
    body: `Don't forget to complete your habit!`,
    scheduledFor: new Date(),
    data: { habitId: h.id }
  }));
}

export async function scheduleRoutineReminders(userId: string, db: PrismaClient): Promise<ScheduledNotification[]> {
  const blocks = (await (db as any).routineBlock.findMany({ where: { template: { userId } } })) || [];
  return blocks.map((b: any) => ({
    userId,
    type: 'routine',
    title: `Upcoming: ${b.name}`,
    body: `Your routine is starting soon.`,
    scheduledFor: new Date(),
    data: { blockId: b.id }
  }));
}

export async function scheduleWeeklyReview(userId: string): Promise<ScheduledNotification> {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return {
    userId,
    type: 'weekly_review',
    title: 'Weekly Review',
    body: 'Time to review your week!',
    scheduledFor: d
  };
}

export function shouldSendNotification(scheduledFor: Date, quietHoursStart?: string, quietHoursEnd?: string): boolean {
  if (!quietHoursStart || !quietHoursEnd) return true;
  const h = scheduledFor.getHours();
  const m = scheduledFor.getMinutes();
  const t = h + m / 60;
  
  const parse = (time: string) => {
    const [hh, mm] = time.split(':').map(Number);
    return hh + mm / 60;
  };
  
  const start = parse(quietHoursStart);
  const end = parse(quietHoursEnd);
  
  if (start < end) {
    return t < start || t >= end;
  } else {
    return t < start && t >= end;
  }
}
