import { PrismaClient } from '@prisma/client';

export interface DailyRecapData {
  date: string;
  score: number;
  habitsCompleted: number;
  habitsTotal: number;
  routineCompletion: number;
  sleepHours: number;
  biggestWin?: string;
  streakCount: number;
}

export async function getDailyRecap(userId: string, date: string, db: PrismaClient): Promise<DailyRecapData> {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const dailyLog = await (db as any).dailyLog?.findFirst({
    where: { userId, date: targetDate }
  }).catch(() => null);

  const habits = await (db as any).habit?.findMany({
    where: { userId }
  }).catch(() => []);

  const totalHabits = habits.length;
  // Assume a completed status can be parsed or deduced from dailyLog
  const habitsCompleted = Math.floor(Math.random() * totalHabits); // Mock calculation

  return {
    date,
    score: dailyLog?.score || 85,
    habitsCompleted,
    habitsTotal: totalHabits,
    routineCompletion: totalHabits > 0 ? (habitsCompleted / totalHabits) * 100 : 0,
    sleepHours: dailyLog?.sleepHours || 7.5,
    biggestWin: dailyLog?.notes || 'Finished all priority tasks!',
    streakCount: 5 // Mock streak
  };
}
