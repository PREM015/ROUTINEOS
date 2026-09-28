import { format, subDays } from 'date-fns';

import { DEFAULT_TZ, todayForUser } from '@/lib/dates';
import prisma from '@/lib/prisma';
import { insightGenerationService } from '@/server/services/insight.service';
import { patternService } from '@/server/services/pattern.service';

/**
 * Weekly insight generation.
 *
 * Previously this returned a hardcoded `{ ok: true, generated: 0 }` while
 * `InsightGenerationService.generate` sat unused by the cron. The capability was
 * already implemented and reachable from POST /api/insights/generate; this job
 * simply schedules it, so the two paths share one implementation.
 *
 * Safe to run repeatedly: `generate` returns the cached insight when an
 * identical period already exists, so a re-run costs nothing.
 *
 * Runs weekly (`0 2 * * 0`), so it targets the seven days ending yesterday,
 * which is the last complete week at the time it fires.
 */

export interface GenerateInsightsOptions {
  /** Hard ceiling on users processed per run, to stay inside the cron timeout. */
  maxUsers?: number;
  /** Period to generate. Only the generatable periods are accepted. */
  period?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  /** Length of the window in days, ending yesterday. */
  windowDays?: number;
  userId?: string;
}

export interface GenerateInsightsResult {
  ok: boolean;
  generated: number;
  cached: number;
  usersScanned: number;
  deferred: number;
  /** Users whose peak-hours patterns were refreshed. */
  patternsUpdated: number;
  errors: Array<{ userId: string; message: string }>;
}

const DEFAULT_MAX_USERS = 25;
const DEFAULT_WINDOW_DAYS = 7;

export async function generateInsights(
  options: GenerateInsightsOptions = {},
): Promise<GenerateInsightsResult> {
  const {
    maxUsers = DEFAULT_MAX_USERS,
    period = 'WEEKLY',
    windowDays = DEFAULT_WINDOW_DAYS,
    userId,
  } = options;

  const result: GenerateInsightsResult = {
    ok: true,
    generated: 0,
    cached: 0,
    usersScanned: 0,
    deferred: 0,
    patternsUpdated: 0,
    errors: [],
  };

  const users = await prisma.user.findMany({
    where: { isDeleted: false, ...(userId ? { id: userId } : {}) },
    select: { id: true, settings: { select: { timezone: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const user of users) {
    if (result.usersScanned >= maxUsers) {
      result.deferred += 1;
      continue;
    }
    result.usersScanned += 1;

    const timezone = user.settings?.timezone ?? DEFAULT_TZ;
    const today = todayForUser(timezone);

    // Calendar dates, so plain arithmetic rather than a timezone shift.
    const endDate = format(subDays(new Date(`${today}T00:00:00Z`), 1), 'yyyy-MM-dd');
    const startDate = format(
      subDays(new Date(`${today}T00:00:00Z`), windowDays),
      'yyyy-MM-dd',
    );

    try {
      const outcome = await insightGenerationService.generate(user.id, {
        period,
        startDate,
        endDate,
      });
      if (outcome.cached) result.cached += 1;
      else result.generated += 1;
    } catch (error) {
      // Most commonly a user with no OPENAI_API_KEY. The app is designed to run
      // without it, so this is recorded and skipped rather than failing the run.
      result.errors.push({
        userId: user.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // Peak-hours detection is independent of the LLM insight above, so it runs
    // even when insight generation failed. Without it the `ProductivityPattern`
    // table stays empty, since nothing else writes to it.
    try {
      const detected = await patternService.detectPeakHours(user.id, timezone);
      result.patternsUpdated += detected.patternsFound;
    } catch (error) {
      result.errors.push({
        userId: user.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

export default generateInsights;
