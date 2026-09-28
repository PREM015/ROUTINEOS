import { ProductivityPatternRepository } from '@/server/repositories/productivity-pattern.repository';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Pattern Service
 * Derives `ProductivityPattern` rows from a user's own focus history.
 *
 * The `ProductivityPattern` table and its `findPeakHours` reader existed, but
 * nothing ever wrote to it, so the table was permanently empty and the
 * focused-user surface had no data. This service is the writer.
 *
 * The detection is deliberately deterministic — it counts completed focus
 * sessions per hour of day — rather than calling an LLM. Peak hours are a
 * frequency question that the user's own data answers directly, and this keeps
 * the cron deterministic and free.
 */

/** Two-hour buckets, matching the `timeOfDay` window format on the model. */
const BUCKET_HOURS = 2;

/** Below this, a bucket is noise rather than a pattern. */
const MIN_SESSIONS_PER_BUCKET = 3;

/** Below this share of total sessions, a bucket is not distinctive. */
const MIN_CONFIDENCE = 0.15;

/** How many buckets to report. */
const MAX_PATTERNS = 3;

export interface PatternDetectionResult {
  userId: string;
  windowDays: number;
  sessionsConsidered: number;
  patternsFound: number;
}

function bucketLabel(hour: number): string {
  const end = (hour + BUCKET_HOURS) % 24;
  return `${String(hour).padStart(2, '0')}:00-${String(end).padStart(2, '0')}:00`;
}

export class PatternService {
  private productivityPatternRepository: ProductivityPatternRepository;
  private focusRepository: FocusRepository;

  constructor() {
    this.productivityPatternRepository = new ProductivityPatternRepository();
    this.focusRepository = new FocusRepository();
  }

  /**
   * Detect the hours a user actually does focused work in, and persist them.
   *
   * Sessions are bucketed by local hour (`startTime` from the user's settings,
   * falling back to UTC) so "09:00" means the same thing to the user as their
   * own clock, not the server's.
   */
  async detectPeakHours(
    userId: string,
    timezone = 'UTC',
    windowDays = 90,
  ): Promise<PatternDetectionResult> {
    const result: PatternDetectionResult = {
      userId,
      windowDays,
      sessionsConsidered: 0,
      patternsFound: 0,
    };

    const from = new Date();
    from.setDate(from.getDate() - windowDays);

    const sessions = await this.focusRepository.findSessions(userId, { from });
    const completed = sessions.filter(
      (session) => session.completedAt !== null && session.completedAt !== undefined,
    );
    result.sessionsConsidered = completed.length;

    if (completed.length < MIN_SESSIONS_PER_BUCKET) {
      // Not enough signal to claim a pattern; leave the table untouched.
      return result;
    }

    // hour -> weekday set
    const buckets = new Map<number, { count: number; weekdays: Set<number> }>();
    for (const session of completed) {
      const hour = Number(formatInTimeZone(session.startedAt, timezone, 'H'));
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

      // `i` is ISO weekday: Mon = 1 … Sun = 7.
      const isoDay = Number(formatInTimeZone(session.startedAt, timezone, 'i'));
      const weekday = isoDay % 7;

      const bucket = buckets.get(hour) ?? { count: 0, weekdays: new Set<number>() };
      bucket.count += 1;
      bucket.weekdays.add(weekday);
      buckets.set(hour, bucket);
    }

    const ranked = Array.from(buckets.entries())
      .map(([hour, data]) => ({
        hour,
        count: data.count,
        weekdays: Array.from(data.weekdays).sort((a, b) => a - b),
        confidence: data.count / completed.length,
      }))
      .filter(
        (entry) => entry.count >= MIN_SESSIONS_PER_BUCKET && entry.confidence >= MIN_CONFIDENCE,
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_PATTERNS);

    for (const entry of ranked) {
      await this.productivityPatternRepository.upsert(userId, {
        patternType: 'PEAK_HOURS',
        timeOfDay: bucketLabel(entry.hour),
        dayOfWeek: entry.weekdays,
        confidence: Number(entry.confidence.toFixed(4)),
        metrics: {
          sessions: entry.count,
          shareOfSessions: Number(entry.confidence.toFixed(4)),
          windowDays,
          timezone,
        },
      });
      result.patternsFound += 1;
    }

    return result;
  }
}

export const patternService = new PatternService();
