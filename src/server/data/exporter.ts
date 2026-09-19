import { HabitRepository } from '@/server/repositories/habit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import prisma from '@/lib/prisma';

/**
 * Data Exporter
 * Export all user data in portable format
 */

export async function exportUserData(
  userId: string,
  options?: {
    includeArchived?: boolean;
    startDate?: string;
    endDate?: string;
  }
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      timezone: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const habitRepository = new HabitRepository();
  const goalRepository = new GoalRepository();
  const routineRepository = new RoutineRepository();
  const scoreRepository = new ScoreRepository();
  const sleepRepository = new SleepRepository();
  const reflectionRepository = new ReflectionRepository();

  // Determine date range
  const endDate = options?.endDate || new Date().toISOString().split('T')[0];
  const startDate = options?.startDate || (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  })();

  const [
    habits,
    goals,
    templates,
    scores,
    sleepLogs,
    reflections,
    settings,
    categories,
    tags,
  ] = await Promise.all([
    habitRepository.findAll(userId, {
      includeArchived: options?.includeArchived,
    }),
    goalRepository.findAll(userId, {}),
    routineRepository.findAllTemplates(userId),
    scoreRepository.findByRange(userId, startDate, endDate),
    sleepRepository.findByRange(userId, startDate, endDate),
    reflectionRepository.findByRange(userId, startDate, endDate),
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.category.findMany({ where: { userId } }),
    prisma.tag.findMany({ where: { userId } }),
  ]);

  // Get habit logs for each habit
  const habitsWithLogs = await Promise.all(
    habits.map(async (habit) => {
      const logs = await habitRepository.findLogsByRange(
        habit.id,
        userId,
        startDate,
        endDate
      );
      return { ...habit, logs };
    })
  );

  // Build export payload
  const exportData = {
    exportMetadata: {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      dataRange: { startDate, endDate },
    },
    user: {
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      accountCreated: user.createdAt,
    },
    settings,
    categories,
    tags,
    habits: habitsWithLogs,
    goals,
    routines: templates,
    scores,
    sleep: sleepLogs,
    reflections,
  };

  return exportData;
}

/**
 * Export to JSON file
 */
export function exportToJSON(data: any): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Export to CSV (habits only for now)
 */
export function exportHabitsToCSV(habits: any[]): string {
  const headers = ['Name', 'Tier', 'Status', 'Frequency', 'Streak', 'Completion Rate'];
  const rows = habits.map(h => [
    h.name,
    h.tier,
    h.status,
    h.frequencyType,
    h.streakCount,
    h.completionRate || 0,
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
}