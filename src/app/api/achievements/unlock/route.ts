import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { notificationService } from '@/server/services/notification.service';
import {
  evaluateUnlocks,
  buildUnlockEvent,
  type UnlockEvent,
} from '@/lib/achievements/unlock-logic';
import type { AchievementWorldState } from '@/lib/achievements/checker';
import type { Achievement } from '@prisma/client';
import prisma from '@/lib/prisma';
import { THRESHOLDS } from '@/config/scoring';

const EPOCH = '2000-01-01';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function definitionIdOf(achievement: Achievement): string | null {
  if (!achievement.metadata) return null;
  try {
    const parsed = JSON.parse(achievement.metadata) as { definitionId?: unknown };
    return typeof parsed.definitionId === 'string' ? parsed.definitionId : null;
  } catch {
    return null;
  }
}

/**
 * Gather a world-state snapshot for achievement evaluation using repository
 * methods plus lean prisma aggregations for totals without a repo accessor.
 */
async function buildWorldState(userId: string): Promise<AchievementWorldState> {
  const today = todayIso();

  const [streak, goals, scores, todayScore, sleepLogs] = await Promise.all([
    new StreakRepository().findByUserId(userId),
    new GoalRepository().findAll(userId, {}),
    new ScoreRepository().findByRange(userId, EPOCH, today),
    new ScoreRepository().findByDate(userId, today),
    new SleepRepository().findByRange(userId, EPOCH, today),
  ]);

  const [totalHabitLogs, moodCount, energyCount, lateEveningCount, focusStats, journalDates] =
    await Promise.all([
      prisma.habitLog.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.moodLog.count({ where: { userId } }),
      prisma.energyLog.count({ where: { userId } }),
      prisma.focusSession.count({
        where: {
          userId,
          completedAt: { not: null },
          startedAt: { gte: new Date(`${today}T20:00:00.000Z`) },
        },
      }),
      new FocusRepository().getStats(userId),
      new JournalRepository().getStreakData(userId),
    ]);

  const perfectDayDates = scores
    .filter(
      (score) =>
        score.totalScore !== null && score.totalScore >= THRESHOLDS.achievements.perfectDay
    )
    .map((score) => score.date);

  const activeDates: string[] = Array.from(
    new Set(
      scores
        .filter((score) => score.isMinimumDay || score.coreScore !== null)
        .map((score) => score.date)
    )
  );

  const weekCounts = new Map<string, number>();
  for (const date of perfectDayDates) {
    const parsed = new Date(`${date}T00:00:00Z`);
    const isoDay = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();
    const mondayMs = parsed.getTime() - (isoDay - 1) * 86_400_000;
    const monday = new Date(mondayMs).toISOString().slice(0, 10);
    weekCounts.set(monday, (weekCounts.get(monday) ?? 0) + 1);
  }
  const perfectWeeks = Array.from(weekCounts.values()).filter((count) => count >= 7).length;

  return {
    totals: {
      streak: streak?.currentStreak ?? 0,
      goalsCompleted: goals.filter((goal) => goal.status === 'COMPLETED').length,
      dailyScore: todayScore?.totalScore ?? undefined,
      earlyWakeups: sleepLogs.filter(
        (log) => log.actualWakeTime !== null && log.actualWakeTime < '06:00'
      ).length,
      lateEvenings: lateEveningCount,
      focusHours: focusStats.totalFocusMinutes / 60,
      focusMinutes: focusStats.totalFocusMinutes,
      wellnessLogs: moodCount + energyCount,
      focusSessions: focusStats.totalSessions,
      perfectDays: perfectDayDates.length,
      perfectWeeks,
      totalHabitLogs,
      daysActive: activeDates.length,
      journalEntries: journalDates.length,
    },
    streaks: {},
    dates: { activeDates },
    counts: {},
  };
}

/**
 * POST /api/achievements/unlock
 * Evaluate which achievements newly qualify for the user and unlock them.
 */
export async function POST(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const repository = new AchievementRepository();

    const [existing, worldState] = await Promise.all([
      repository.findByUserId(userId),
      buildWorldState(userId),
    ]);

    const ownedIds = existing
      .map((achievement) => definitionIdOf(achievement))
      .filter((id): id is string => id !== null);
    const newlyQualifying = evaluateUnlocks(userId, worldState, ownedIds);

    const unlockedEvents: UnlockEvent[] = [];
    const auditRepository = new AuditRepository();

    for (const definition of newlyQualifying) {
      const level = definition.criteria[0]?.value ?? 1;
      const achievement = await repository.create(userId, {
        type: definition.type,
        title: definition.name,
        description: definition.description,
        icon: definition.icon,
        color: definition.color,
        level,
        metadata: JSON.stringify({ definitionId: definition.id }),
      });

      const event = buildUnlockEvent(definition, achievement.unlockedAt);
      unlockedEvents.push(event);

      await notificationService.notifyAchievement({ id: achievement.id, title: achievement.title });
      await auditRepository.createActivity({
        userId,
        action: 'ACHIEVEMENT_UNLOCKED',
        entityType: 'achievement',
        entityId: achievement.id,
        description: `Unlocked achievement: ${achievement.title}`,
        metadata: { definitionId: definition.id },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        count: unlockedEvents.length,
        unlocked: unlockedEvents,
      },
    });
  } catch (error) {
    console.error('Error unlocking achievements:', error);
    return NextResponse.json(
      { error: 'Failed to unlock achievements' },
      { status: 500 }
    );
  }
}