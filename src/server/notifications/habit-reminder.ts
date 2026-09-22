import { PrismaClient } from '@prisma/client';

export async function getHabitsNeedingReminder(
  userId: string,
  db: PrismaClient,
  _date: string
): Promise<Array<{ habitId: string; name: string; scheduledTime?: string }>> {
  const habits = (await (db as any).habit.findMany({ where: { userId } })) || [];
  return habits.map((h: any) => ({
    habitId: h.id,
    name: h.name,
    scheduledTime: '09:00'
  }));
}

export function buildHabitReminderMessage(habitName: string, scheduledTime?: string): { title: string; body: string } {
  return {
    title: `Habit Reminder: ${habitName}`,
    body: scheduledTime ? `It's time to do ${habitName} at ${scheduledTime}` : `It's time to do ${habitName}`
  };
}

export async function markReminderSent(habitId: string, date: string, db: PrismaClient): Promise<void> {
  await (db as any).habitReminderLog.create({
    data: { habitId, date, sentAt: new Date() }
  });
}
