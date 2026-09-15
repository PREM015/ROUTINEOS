import { PrismaClient } from "@/generated/prisma";
import { calculateCoreScore } from "./calculate-core-score";
import { calculateOverallScore } from "./calculate-overall-score";
import { createScoreSnapshot, snapshotToJSON } from "./snapshot";
import { getScoreBand } from "./bands";

export async function calculateDailyScore(userId: string, date: string, db: PrismaClient): Promise<any> {
  // Fetch user day settings
  const userDay = await db.userDay.findUnique({
    where: { userId_date: { userId, date } }
  });
  const dayMode = userDay?.dayMode || 'NORMAL';

  // Fetch habits and logs
  const habits = await db.habit.findMany({ where: { userId, isActive: true } });
  const logs = await db.habitLog.findMany({ where: { userId, date } });

  let nonNegTotal = 0, nonNegCompleted = 0;
  let growthTotal = 0, growthCompleted = 0;
  let bonusTotal = 0, bonusCompleted = 0;

  for (const habit of habits) {
    const log = logs.find(l => l.habitId === habit.id);
    const completed = log?.completed ? 1 : 0;

    switch (habit.tier) {
      case 'NON_NEGOTIABLE':
        nonNegTotal++;
        nonNegCompleted += completed;
        break;
      case 'GROWTH':
        growthTotal++;
        growthCompleted += completed;
        break;
      case 'BONUS':
        bonusTotal++;
        bonusCompleted += completed;
        break;
    }
  }

  const coreScore = calculateCoreScore({
    nonNegCompleted, nonNegTotal,
    growthCompleted, growthTotal,
    bonusCompleted, bonusTotal,
    weightNonNeg: 50, weightGrowth: 40, weightBonus: 10
  });

  const overallScore = calculateOverallScore({
    coreScore, dayMode, nonNegCompleted, nonNegTotal
  });

  const snapshot = createScoreSnapshot({
    nonNegCompleted, nonNegTotal,
    growthCompleted, growthTotal,
    bonusCompleted, bonusTotal,
    coreScore, overallScore, dayMode
  });

  const dailyScore = await db.dailyScore.upsert({
    where: { userId_date: { userId, date } },
    update: {
      score: overallScore,
      coreScore,
      band: getScoreBand(overallScore),
      snapshot: snapshotToJSON(snapshot)
    },
    create: {
      userId,
      date,
      score: overallScore,
      coreScore,
      band: getScoreBand(overallScore),
      snapshot: snapshotToJSON(snapshot)
    }
  });

  return dailyScore;
}
