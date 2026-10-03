import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import { DEFAULT_TZ, todayForUser } from '@/lib/dates';
import prisma from '@/lib/prisma';
import { ScoringService } from '@/server/services/scoring.service';
import { streakRecomputeService } from '@/server/services/streak-recompute.service';
import { toUserId } from '@/types/ids';

/**
 * Backfill DailyScore rows for days the user never generated one.
 *
 * Scores are otherwise only written when the user acts (logging a habit or a
 * routine block). Without this job an inactive day has no row at all, which
 * means streaks cannot distinguish "did nothing" from "no data", and weekly,
 * monthly and yearly analytics average over fewer days than the period implies.
 *
 * Safe to run repeatedly: ScoringService.calculateDailyScore ends in
 * scoreRepository.upsertScore, which is a Prisma upsert on (userId, date).
 *
 * Deliberately does NOT score today. The current day is still in progress, so
 * a score written now would be a partial figure that the user's own activity
 * would overwrite later anyway.
 */

export interface ComputeDailyScoresOptions {
  /** Hard ceiling on rows written per run, to stay inside the cron timeout. */
  maxScores?: number;
  /** Safety bound on how far back a single user is backfilled. */
  maxLookbackDays?: number;
  /** Restrict the run to one user. Used by the API route when debugging. */
  userId?: string;
}

export interface ComputeDailyScoresResult {
  ok: boolean;
  updated: number;
  usersScanned: number;
  /** Work left over because maxScores was reached. Non-zero means catch up next run. */
  deferred: number;
  /** Dates skipped because a row already existed. */
  skipped: number;
  /** Users whose stored streak was rebuilt after a backfill. */
  streaksRecomputed: number;
  /** Of those, how many actually differed from the stored value. */
  streaksChanged: number;
  errors: Array<{ userId: string; date?: string; message: string }>;
}

const DEFAULT_MAX_SCORES = 200;
const DEFAULT_MAX_LOOKBACK_DAYS = 90;

function toDateKey(date: Date, timezone: string): string {
  // format() works in local time, so shift the instant into the user's zone first.
  return format(toZonedTime(date, timezone), 'yyyy-MM-dd');
}

export async function computeDailyScores(
  options: ComputeDailyScoresOptions = {},
): Promise<ComputeDailyScoresResult> {
  const {
    maxScores = DEFAULT_MAX_SCORES,
    maxLookbackDays = DEFAULT_MAX_LOOKBACK_DAYS,
    userId,
  } = options;

  const result: ComputeDailyScoresResult = {
    ok: true,
    updated: 0,
    usersScanned: 0,
    deferred: 0,
    skipped: 0,
    streaksRecomputed: 0,
    streaksChanged: 0,
    errors: [],
  };

  const users = await prisma.user.findMany({
    where: { isDeleted: false, ...(userId ? { id: userId } : {}) },
    select: {
      id: true,
      createdAt: true,
      settings: { select: { timezone: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const scoringService = new ScoringService();

  for (const user of users) {
    if (result.updated >= maxScores) {
      // Budget spent. Leave the rest for the next scheduled run rather than
      // overrunning the cron window.
      result.deferred += 1;
      continue;
    }

    result.usersScanned += 1;

    const timezone = user.settings?.timezone ?? DEFAULT_TZ;
    const today = todayForUser(timezone);

    // `today` and everything derived from it is a calendar date, not an instant,
    // so it is shifted with plain calendar arithmetic. Only createdAt below is a
    // real timestamp and needs projecting into the user's zone.
    const yesterday = format(subDays(parseISO(today), 1), 'yyyy-MM-dd');

    // Never invent history from before the account existed.
    const createdDate = toDateKey(user.createdAt, timezone);
    const earliest = format(subDays(parseISO(today), maxLookbackDays), 'yyyy-MM-dd');
    const startDate = createdDate > earliest ? createdDate : earliest;

    if (startDate > yesterday) {
      continue;
    }

    const existing = await prisma.dailyScore.findMany({
      where: { userId: user.id, date: { gte: startDate, lte: yesterday } },
      select: { date: true },
    });
    const existingDates = new Set(existing.map((row) => row.date));

    const missing = eachDayOfInterval({
      start: parseISO(startDate),
      end: yesterday,
    }).map((day) => format(day, 'yyyy-MM-dd'));

    result.skipped += existingDates.size;

    for (const date of missing) {
      if (existingDates.has(date)) continue;

      if (result.updated >= maxScores) {
        result.deferred += 1;
        break;
      }

      try {
        await scoringService.calculateDailyScore(toUserId(user.id), date);
        result.updated += 1;
      } catch (error) {
        // One bad day must not abort the whole backfill.
        result.errors.push({
          userId: user.id,
          date,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // A backfilled day changes what the streak *should* be, but the stored
    // `Streak` row is maintained incrementally and is never revisited. Rebuild
    // it whenever this run actually wrote something, so backfills self-heal
    // instead of leaving `currentStreak` permanently wrong.
    if (result.updated > 0) {
      try {
        const recomputed = await streakRecomputeService.recompute(toUserId(user.id), yesterday);
        result.streaksRecomputed += 1;
        if (recomputed.changed) {
          result.streaksChanged += 1;
        }
      } catch (error) {
        // The score backfill already succeeded; a streak rebuild failure should
        // be visible but must not fail the job.
        result.errors.push({
          userId: user.id,
          message: `streak recompute failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

export default computeDailyScores;
