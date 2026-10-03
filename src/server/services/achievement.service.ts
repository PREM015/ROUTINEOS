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
import { allDefinitions, getAchievementById } from '@/lib/achievements/definitions';
import { definitionIdOf as definitionIdOfRow } from '@/lib/achievements/metadata';
import {
  isLateEvening,
  longestConsecutiveRun,
  longestPerfectWeekStreak,
} from '@/lib/achievements/timeframes';
import type {
  AchievementCategory,
  AchievementCriteria,
  AchievementDefinitionConfig,
  AchievementRarity,
} from '@/lib/constants/achievements';
import { UNKNOWN_ACHIEVEMENT_RARITY } from '@/lib/achievements/xp';
import type { AchievementWorldState } from '@/lib/achievements/checker';
import { resolveCriterionValue } from '@/lib/achievements/checker';
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
  return definitionIdOfRow(achievement);
}

/**
 * One achievement as the showcase card needs it.
 *
 * `state` is derived, never stored: an `Achievement` row is by definition an
 * unlock, so "unlocked" is a function of which table the row came from. For the
 * locked set it is a function of whether any progress exists.
 */
export interface AchievementShowcaseItem {
  state: 'UNLOCKED' | 'IN_PROGRESS' | 'LOCKED';
  /** The catalogue id, stable across the two states. */
  id: string;
  /** The `Achievement` row id, or `null` for a locked one. */
  recordId: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  level: number;
  /** `null` means "not measurable", which is distinct from `0`. */
  current: number | null;
  target: number | null;
  percent: number | null;
  unlockedAt: string | null;
  /** False means the user has not marked this one seen yet. */
  celebrated: boolean;
}

export interface AchievementShowcase {
  unlocked: AchievementShowcaseItem[];
  locked: AchievementShowcaseItem[];
  counts: {
    unlocked: number;
    inProgress: number;
    locked: number;
    /** The size of the whole catalogue, so a partially-filled grid is honest. */
    total: number;
  };
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
 *
 * Returns the snapshot together with the `today` and `timezone` it was built
 * against: `checkCriteria` needs `today` to place a windowed criterion, and
 * recomputing it would be a second settings read for a value that can differ
 * across a midnight boundary mid-request.
 */
async function buildWorldState(
  userId: string,
  options: { includeActiveDates?: boolean } = {}
): Promise<{
  worldState: AchievementWorldState;
  today: string;
  timezone: string;
}> {
  /**
   * `includeActiveDates` defaults to true so the *evaluation* path
   * (`checkForUnlocks`) is byte-for-byte unchanged.
   *
   * `getNextUnearned` — which the dashboard's `AchievementsShowcase`
   * calls on every load and every 5-minute poll — needs only the numeric totals,
   * and passes `false` to skip materialising the per-day list. Note that
   * `dates.activeDates` is currently written and **read by no caller**; it is
   * retained so the shape does not change under the evaluation path, but the
   * read path stops paying for it.
   */
  const includeActiveDates = options.includeActiveDates !== false;
  const timezone = await new UserRepository()
    .getSettings(userId)
    .then((s) => s?.timezone || DEFAULT_TZ)
    .catch(() => DEFAULT_TZ);
  const today = getTodayString(timezone);

  /**
   * F1 — the two 730-day range loads are gone.
   *
   * This function previously pulled **every** `DailyScore` and `SleepLog` row for
   * two years, `calculationData` JSON breakdown included, on every dashboard load
   * and every 5-minute poll — and then used them for three counts and one
   * week-bucketing pass. `getNextUnearned` draws three progress rings from the
   * result.
   *
   * All four derived values now come from queries that return an integer or a
   * single column:
   *   perfectDays  → `countPerfectDays`      (already existed)
   *   daysActive   → `countActiveDays`       (new — was a `Set` over all rows)
   *   perfectWeeks → `findPerfectDayDates`   (new — selects `date` only, and only
   *                                            for rows that clear the threshold)
   *   earlyWakeups → `countEarlyWakeups`     (new — was a filter over all rows)
   *
   * The week-bucketing arithmetic below is unchanged, so the numbers are
   * identical; only the amount of data crossing the network is not.
   */
  const historyStart_ = historyStart(today);
  const perfectDayThreshold = THRESHOLDS.achievements.perfectDay;

  const [streak, goals, perfectDayDates, daysActive, earlyWakeups, todayScore, sessionStarts] =
    await Promise.all([
      new StreakRepository().findByUserId(userId),
      new GoalRepository().findAll(userId, {}),
      new ScoreRepository().findPerfectDayDates(
        userId,
        historyStart_,
        today,
        perfectDayThreshold
      ),
      new ScoreRepository().countActiveDays(userId, historyStart_, today),
      new SleepRepository().countEarlyWakeups(userId, historyStart_, today, '06:00'),
      new ScoreRepository().findByDate(userId, today),
      // Night Owl is a *local clock hour* test, so the instants have to reach
      // this function; see `isLateEvening`.
      new FocusRepository().findCompletedSessionStarts(userId),
    ]);

  const [totalHabitLogs, moodCount, energyCount, focusStats, journalDates] = await Promise.all([
    new HabitRepository().countAllCompletedLogs(userId),
    new MoodRepository().countMoodLogs(userId),
    new MoodRepository().countEnergyLogs(userId),
    new FocusRepository().getStats(userId),
    new JournalRepository().getStreakData(userId),
  ]);

  // Only the evaluation path needs the per-day list; see the note on
  // `includeActiveDates`. One column, not a full row.
  const activeDates = includeActiveDates
    ? await new ScoreRepository().findActiveDayDates(userId, historyStart_, today)
    : [];

  /**
   * "Night Owl" is "20 productive late-evening sessions", all-time.
   *
   * It was counting completed sessions started **after 20:00 on the current
   * day** — a window a few hours wide, so the counter could realistically reach
   * 1 or 2 and the 20-session target was unreachable. The description is a
   * lifetime claim about a habit, so it is now a lifetime count, with "late
   * evening" evaluated per session in the user's own timezone.
   */
  const lateEvenings = sessionStarts.filter((startedAt) =>
    isLateEvening(startedAt, timezone)
  ).length;

  /**
   * Consecutive-run totals, derived from the perfect-day dates already loaded.
   *
   * Both are *best ever*, never windowed: a count inside a trailing window
   * shrinks as soon as a day is missed, and an achievement one check away from
   * firing would then never fire. `perfectWeeks` keeps its previous
   * all-time meaning for the dashboard; the streak is a separate number because
   * "4 perfect weeks in a row" is a different claim from "4 perfect weeks".
   */
  const perfectDayStreak = longestConsecutiveRun(perfectDayDates);
  const perfectWeekStreak = longestPerfectWeekStreak(perfectDayDates);

  return {
    worldState: {
      totals: {
        streak: streak?.currentStreak ?? 0,
        goalsCompleted: goals.filter((goal) => goal.status === 'COMPLETED').length,
        dailyScore: todayScore?.totalScore ?? undefined,
        earlyWakeups,
        lateEvenings,
        focusHours: focusStats.totalFocusMinutes / 60,
        focusMinutes: focusStats.totalFocusMinutes,
        wellnessLogs: moodCount + energyCount,
        focusSessions: focusStats.totalSessions,
        perfectDays: perfectDayDates.length,
        perfectDayStreak,
        perfectWeekStreak,
        totalHabitLogs,
        daysActive,
        journalEntries: journalDates.length,
      },
      streaks: {},
      dates: {
        activeDates: includeActiveDates ? activeDates : [],
        // Dated series backing the windowed criteria. Present on both the
        // evaluation and the read path: a locked tile that says "5 of 7 days this
        // week" needs the same data the unlock check does.
        perfectDayDates,
      },
      counts: {},
    },
    today,
    timezone,
  };
}

/** Progress toward one definition's target, or "not measurable". */
export interface DefinitionProgress {
  /** `null` means the field is absent from the world state, not "zero". */
  current: number | null;
  target: number;
  /** `null` when `current` is `null`; otherwise clamped to 0–100. */
  percent: number | null;
}

/**
 * Current progress toward a definition's first criterion.
 *
 * Shared by `getShowcase` and `getNextUnearned` so a locked tile can never show
 * one number while the unlock check is deciding on another. `today` matters:
 * without it a windowed criterion is unmeasurable and reports `null` rather than
 * quietly falling back to its lifetime count.
 */
function resolveDefinitionProgress(
  definition: AchievementDefinitionConfig,
  worldState: AchievementWorldState,
  today: string
): DefinitionProgress {
  // Every definition currently gates on a single criterion; the catalogue's
  // first entry is that criterion.
  //
  // Widened to `AchievementCriteria` because the registry is `as const`: an entry
  // written without a `timeframe` key infers as an object type *without* that
  // property, so reading `.timeframe` off the raw literal union is an error even
  // though the field is optional on the interface.
  const criterion: AchievementCriteria | undefined = definition.criteria[0];
  const target = criterion?.value ?? 1;
  const resolved = criterion
    ? resolveCriterionValue(criterion.field, worldState, criterion.timeframe, today)
    : undefined;
  const current = typeof resolved === 'number' ? resolved : null;
  return {
    current,
    target,
    percent: current === null ? null : Math.max(0, Math.min(100, (current / target) * 100)),
  };
}

/** Closest-first: unknown progress last, so it cannot masquerade as "next". */
function byClosestFirst(
  a: { percent: number | null },
  b: { percent: number | null }
): number {
  if (a.percent === null && b.percent === null) return 0;
  if (a.percent === null) return 1;
  if (b.percent === null) return -1;
  return b.percent - a.percent;
}

export class AchievementService {
  /**
   * Everything the showcase card needs, in one call.
   *
   * The card previously made two requests - `/api/achievements` for the earned
   * set and `/api/achievements/next` for the locked one - and rendered them side
   * by side. Two problems, both structural:
   *
   *  - **`buildWorldState` ran once per request** (it is ~10 queries), so a single
   *    card cost two world-state builds to show one set of numbers.
   *  - **Nothing reconciled the two halves.** An achievement unlocked between the
   *    two requests appears twice; one deleted appears once as "owned" and never
   *    as "next". Deriving both halves from one snapshot makes that impossible.
   *
   * It also carries `category` and `rarity`, which have been in
   * `ACHIEVEMENT_DEFINITIONS` all along and were never sent. They are static
   * config, not new data - the definitions are the source of truth, and
   * `getNextUnearned` was already reading them to get the icon and colour.
   */
  async getShowcase(userId: string, lockedCount = 12): Promise<AchievementShowcase> {
    const [existing, snapshot] = await Promise.all([
      this.repository.findByUserId(userId),
      buildWorldState(userId, { includeActiveDates: false }),
    ]);
    const { worldState, today } = snapshot;

    const ownedIds = new Set(
      existing
        .map((achievement) => definitionIdOf(achievement))
        .filter((id): id is string => id !== null)
    );

    const unlocked: AchievementShowcaseItem[] = existing
      .map((achievement) => {
        const definitionId = definitionIdOf(achievement);
        const definition = definitionId ? getAchievementById(definitionId) : undefined;
        return {
          state: 'UNLOCKED' as const,
          id: definitionId ?? achievement.id,
          recordId: achievement.id,
          name: definition?.name ?? achievement.title,
          description: definition?.description ?? achievement.description ?? '',
          icon: definition?.icon ?? achievement.icon ?? '🏅',
          color: definition?.color ?? achievement.color ?? 'var(--accent-streak)',
          category: definition?.category ?? 'MILESTONES',
          rarity: definition?.rarity ?? UNKNOWN_ACHIEVEMENT_RARITY,
          level: achievement.level,
          current: null,
          target: null,
          percent: null,
          unlockedAt: achievement.unlockedAt.toISOString(),
          celebrated: achievement.celebrated,
        };
      })
      .sort((a, b) => Date.parse(b.unlockedAt) - Date.parse(a.unlockedAt));

    const locked: AchievementShowcaseItem[] = allDefinitions
      .filter((definition) => !ownedIds.has(definition.id))
      .map((definition) => {
        const progress = resolveDefinitionProgress(definition, worldState, today);
        return {
          // `null` is "the app cannot tell how far along you are", which is
          // deliberately different from 0. Rendering it as 0 would draw a full ring
          // on a badge nobody has started.
          state: (progress.current !== null && progress.current > 0
            ? 'IN_PROGRESS'
            : 'LOCKED') as 'IN_PROGRESS' | 'LOCKED',
          id: definition.id,
          recordId: null,
          name: definition.name,
          description: definition.description,
          icon: definition.icon,
          color: definition.color,
          category: definition.category,
          rarity: definition.rarity,
          level: 1,
          current: progress.current,
          target: progress.target,
          percent: progress.percent,
          unlockedAt: null,
          celebrated: true,
        };
      })
      .sort(byClosestFirst)
      .slice(0, lockedCount);

    return {
      unlocked,
      locked,
      counts: {
        unlocked: unlocked.length,
        inProgress: locked.filter((l) => l.state === 'IN_PROGRESS').length,
        locked: locked.filter((l) => l.state === 'LOCKED').length,
        total: allDefinitions.length,
      },
    };
  }

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
   * The achievements the user does not own yet, closest first, each with its
   * current progress toward the target.
   *
   * Exists because the dashboard's achievements strip needs "3/5 days to next
   * badge". That information was computable but not reachable: `buildWorldState`
   * was module-private, `checkForUnlocks` returns only definitions that *already*
   * qualify, and `GET /api/achievements` returns only what is already owned — so
   * a locked badge had nothing to put inside its progress ring.
   *
   * `current` is `null` when the criterion field is absent from the world state,
   * which is deliberately different from `0`: "the app cannot tell how far along
   * you are" must not render as "0 of 10", which would draw a full progress ring
   * on a badge nobody has started.
   */
  async getNextUnearned(
    userId: string,
    count = 3
  ): Promise<
    {
      id: string;
      name: string;
      description: string;
      icon: string;
      color: string;
      current: number | null;
      target: number;
      percent: number | null;
    }[]
  > {
    const existing = await this.repository.findByUserId(userId);
    const ownedSet = new Set(
      existing
        .map((achievement) => definitionIdOf(achievement))
        .filter((id): id is string => id !== null)
    );

    const unowned = allDefinitions.filter((definition) => !ownedSet.has(definition.id));
    if (unowned.length === 0) return [];

    const { worldState, today } = await buildWorldState(userId, {
      includeActiveDates: false,
    });

    return unowned
      .map((definition) => {
        const progress = resolveDefinitionProgress(definition, worldState, today);
        return {
          id: definition.id,
          name: definition.name,
          description: definition.description,
          icon: definition.icon,
          color: definition.color,
          current: progress.current,
          target: progress.target,
          percent: progress.percent,
        };
      })
      .sort(byClosestFirst)
      .slice(0, count);
  }

  /**
   * Evaluate which achievements newly qualify for a user and unlock them.
   *
   * Idempotent: definitions the user already owns are skipped, and the write
   * itself is a single upsert against `@@unique([userId, definitionId])`, so two
   * concurrent checks cannot both insert. Returns the newly unlocked events in
   * catalog order (empty when nothing qualifies).
   */
  async checkForUnlocks(userId: string): Promise<UnlockEvent[]> {
    // Read the owned achievements FIRST and bail out before building the world
    // state when there is nothing left to unlock.
    //
    // `buildWorldState` issues ~10 repository queries. This method runs on every
    // habit log, so doing that work to then discard it was the single most
    // expensive thing in the log-a-habit path. `evaluateUnlocks` can only ever
    // return definitions the user does not already own, so once every definition
    // is owned the answer is empty regardless of world state.
    const existing = await this.repository.findByUserId(userId);

    const ownedIds = existing
      .map((achievement) => definitionIdOf(achievement))
      .filter((id): id is string => id !== null);

    const ownedSet = new Set(ownedIds);
    if (allDefinitions.every((definition) => ownedSet.has(definition.id))) {
      return [];
    }

    const { worldState, today } = await buildWorldState(userId);
    const newlyQualifying = evaluateUnlocks(userId, worldState, ownedIds, today);

    const unlockedEvents: UnlockEvent[] = [];
    const auditRepository = new AuditRepository();

    for (const definition of newlyQualifying) {
      const level = definition.criteria[0]?.value ?? 1;
      /**
       * The upsert is the actual concurrency guard. `ownedIds` was read before
       * the world state was built, so by the time we get here a second request
       * may already have inserted the same badge; `created: false` means it did,
       * and that request already sent the notification and wrote the audit row.
       */
      const { achievement, created } = await this.repository.createForDefinition(
        userId,
        definition.id,
        {
          type: definition.type,
          title: definition.name,
          description: definition.description,
          icon: definition.icon,
          color: definition.color,
          level,
          metadata: JSON.stringify({ definitionId: definition.id }),
        }
      );

      if (!created) continue;

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
   * This used to write an `ACHIEVEMENT_CELEBRATED` audit row and return the
   * achievement untouched, so `Achievement.celebrated` stayed `false` forever.
   * Every "New" badge in the UI reads that column, which meant dismissing a
   * celebration did nothing and the badge came back as new on the next load.
   *
   * @throws when the achievement does not exist or is not unlocked by this user.
   */
  async celebrateAchievement(
    userId: string,
    achievementId: string,
  ): Promise<{ type: 'achievement'; achievement: Achievement }> {
    /**
     * The owner check *is* the `where` clause of the update, so there is no
     * read-then-write window in which another user's id could be used. `null`
     * means the id is not this user's — or does not exist, which is the same
     * answer the caller needs.
     */
    const achievement = await this.repository.markCelebrated(userId, achievementId);
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
