/**
 * Achievement Service
 *
 * Owns achievement unlock evaluation. Given a user's real data it builds a
 * world-state snapshot, evaluates the definition catalog for newly qualifying
 * achievements, persists them, notifies and audits. API routes delegate here
 * so the unlock flow is thin and reusable by other services.
 */

import type { Achievement, StreakMilestone } from '@/generated/prisma';
import { THRESHOLDS } from '@/config/scoring';
import {
  buildUnlockEvent,
  evaluateUnlocks,
  type UnlockEvent,
} from '@/lib/achievements/unlock-logic';
import { allDefinitions } from '@/lib/achievements/definitions';
import type { AchievementWorldState } from '@/lib/achievements/checker';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { MoodRepository } from '@/server/repositories/mood.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { notificationService } from '@/server/services/notification.service';
import { DEFAULT_TZ, getTodayString, shiftCalendarDay } from '@/lib/dates';
import { fromZonedTime } from 'date-fns-tz';

/**
 * Upper bound on the history `buildWorldState` loads.
 *
 * These reads were unbounded (`EPOCH` to today), so they grew for the lifetime of
 * the account and were paid on every habit log that reached evaluation. Two
 * years is far beyond any achievement window — the longest criteria is a
 * perfect-week streak, and no realistic streak spans years — so capping here
 * changes no reachable result while keeping the query bounded.
 */
const PATTERN_HISTORY_DAYS = 730;

/** `today` shifted back `PATTERN_HISTORY_DAYS`, as a YYYY-MM-DD string. */
function historyStart(today: string): string {
  return shiftCalendarDay(today, -PATTERN_HISTORY_DAYS);
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
/**
 * Gather a world-state snapshot for achievement evaluation using repository
 * methods plus lean prisma aggregations for totals without a repo accessor.
 *
 * Every date here is the *user's* calendar day. This previously used
 * `new Date().toISOString().slice(0, 10)` — the UTC date — and gated
 * "late evening session" on a hard-coded `T20:00:00.000Z`. For a user in
 * `Asia/Tokyo` the 20:00 boundary is 05:00 the next morning local, so the
 * "Night Owl" achievement fired on the wrong day's sessions; and for anyone
 * west of UTC the snapshot was taken against a day that had not started.
 */
async function buildWorldState(userId: string): Promise<AchievementWorldState> {
  const timezone = await new UserRepository()
    .getSettings(userId)
    .then((s) => s?.timezone || DEFAULT_TZ)
    .catch(() => DEFAULT_TZ);
  const today = getTodayString(timezone);

  const [streak, goals, scores, todayScore, sleepLogs] = await Promise.all([
    new StreakRepository().findByUserId(userId),
    new GoalRepository().findAll(userId, {}),
    new ScoreRepository().findByRange(userId, historyStart(today), today),
    new ScoreRepository().findByDate(userId, today),
    new SleepRepository().findByRange(userId, historyStart(today), today),
  ]);

  const [totalHabitLogs, moodCount, energyCount, lateEveningCount, focusStats, journalDates] =
    await Promise.all([
      new HabitRepository().countAllCompletedLogs(userId),
      new MoodRepository().countMoodLogs(userId),
      new MoodRepository().countEnergyLogs(userId),
      // 20:00 in the user's zone, not 20:00 UTC.
      new FocusRepository().countCompletedSessions(
        userId,
        fromZonedTime(`${today}T20:00:00`, timezone)
      ),
      new FocusRepository().getStats(userId),
      new JournalRepository().getStreakData(userId),
    ]);

  const perfectDayDates = scores
    .filter(
      (score) =>
        score.totalScore !== null && score.totalScore >= THRESHOLDS.achievements.perfectDay,
    )
    .map((score) => score.date);

  const activeDates: string[] = Array.from(
    new Set(
      scores
        .filter((score) => score.isMinimumDay || score.coreScore !== null)
        .map((score) => score.date),
    ),
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
        (log) => log.actualWakeTime !== null && log.actualWakeTime < '06:00',
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

export class AchievementService {
  /**
   * Recently unlocked achievements plus the total owned, for the achievements
   * screen. Moved out of the route so the two counts stay paired with the
   * same query.
   */
  async listRecent(
    userId: string,
    limit = 50,
  ): Promise<{ achievements: Achievement[]; total: number }> {
    const [achievements, unlocked] = await Promise.all([
      this.repository.recentUnlocked(userId, limit),
      this.repository.findUnlocked(userId),
    ]);
    return { achievements, total: unlocked.length };
  }

  private repository = new AchievementRepository();

  /**
   * Evaluate which achievements newly qualify for a user and unlock them.
   *
   * Idempotent: definitions the user already owns are skipped. Returns the
   * newly unlocked events in catalog order (empty when nothing qualifies).
   */
  async checkForUnlocks(userId: string): Promise<UnlockEvent[]> {
    // Read the owned achievements FIRST and bail out before building the world
    // state when there is nothing left to unlock.
    //
    // `buildWorldState` issues ~10 repository queries and loads the user's
    // entire score and sleep history (from 2000-01-01) into memory. This method
    // runs on every habit log, so doing that work to then discard it was the
    // single most expensive thing in the log-a-habit path. `evaluateUnlocks`
    // can only ever return definitions the user does not already own, so once
    // every definition is owned the answer is empty regardless of world state.
    const existing = await this.repository.findByUserId(userId);

    const ownedIds = existing
      .map((achievement) => definitionIdOf(achievement))
      .filter((id): id is string => id !== null);

    const ownedSet = new Set(ownedIds);
    if (allDefinitions.every((definition) => ownedSet.has(definition.id))) {
      return [];
    }

    const worldState = await buildWorldState(userId);
    const newlyQualifying = evaluateUnlocks(userId, worldState, ownedIds);

    const unlockedEvents: UnlockEvent[] = [];
    const auditRepository = new AuditRepository();

    for (const definition of newlyQualifying) {
      const level = definition.criteria[0]?.value ?? 1;
      const achievement = await this.repository.create(userId, {
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

      await notificationService.notifyAchievement(userId, {
        id: achievement.id,
        title: achievement.title,
      });
      await auditRepository.createActivity({
        userId,
        action: 'ACHIEVEMENT_UNLOCKED',
        entityType: 'achievement',
        entityId: achievement.id,
        description: `Unlocked achievement: ${achievement.title}`,
        metadata: { definitionId: definition.id },
      });
    }

    return unlockedEvents;
  }

  /**
   * The user's streak, created on first access, plus any milestones they have
   * not celebrated yet.
   */
  async getStreakWithMilestones(userId: string) {
    const streakRepository = new StreakRepository();
    let streak = await streakRepository.findByUserId(userId);

    if (!streak) {
      streak = await streakRepository.create(userId);
    }

    const milestones = await streakRepository.getUncelebratedMilestones(userId);

    return { ...streak, uncelebratedMilestones: milestones };
  }

  /**
   * Record a celebration for a streak milestone, scoped to its owner.
   *
   * @throws when the milestone does not exist or belongs to someone else.
   */
  async celebrateMilestone(
    userId: string,
    milestoneId: string,
  ): Promise<{ type: 'milestone'; milestone: StreakMilestone }> {
    const milestone = await new StreakRepository().findMilestoneById(milestoneId, userId);
    if (!milestone) {
      throw new Error('Streak milestone not found');
    }

    const updated = await new StreakRepository().celebrateMilestone(milestone.id);

    await new AuditRepository().createActivity({
      userId,
      action: 'MILESTONE_CELEBRATED',
      entityType: 'streakMilestone',
      entityId: milestone.id,
      description: `Celebrated ${milestone.milestoneDays}-day streak milestone`,
    });

    return { type: 'milestone', milestone: updated };
  }

  /**
   * Record a celebration for an unlocked achievement, scoped to its owner.
   *
   * @throws when the achievement does not exist or is not unlocked by this user.
   */
  async celebrateAchievement(
    userId: string,
    achievementId: string,
  ): Promise<{ type: 'achievement'; achievement: Achievement }> {
    const achievement = await this.repository.findById(userId, achievementId);
    if (!achievement) {
      throw new Error('Achievement not found');
    }

    await new AuditRepository().createActivity({
      userId,
      action: 'ACHIEVEMENT_CELEBRATED',
      entityType: 'achievement',
      entityId: achievement.id,
      description: `Celebrated achievement: ${achievement.title}`,
    });

    return { type: 'achievement', achievement };
  }
}

export const achievementService = new AchievementService();
