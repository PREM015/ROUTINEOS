import type { FocusSession } from '@prisma/client';

/**
 * Focus analytics helpers.
 * Pure aggregation functions over focus session records.
 */

export interface FocusSummary {
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  totalPlannedMinutes: number;
  totalActualMinutes: number;
  averageSessionDuration: number;
  averageFocusRating: number | null;
}

export interface ProductiveTimeBucket {
  /** Hour of day (0-23, local time) in which the session started. */
  hour: number;
  totalMinutes: number;
  sessionCount: number;
  averageFocusRating: number | null;
}

/**
 * Session duration in minutes, falling back to the planned duration when the
 * actual duration was never recorded.
 */
export function sessionMinutes(session: Pick<FocusSession, 'plannedDuration' | 'actualDuration'>): number {
  return session.actualDuration ?? session.plannedDuration;
}

/**
 * Aggregate a set of sessions into a dashboard summary. A session counts as
 * completed only when it has a completion timestamp.
 */
export function focusSummary(sessions: readonly FocusSession[]): FocusSummary {
  let completedSessions = 0;
  let totalPlannedMinutes = 0;
  let totalActualMinutes = 0;
  let focusRatingSum = 0;
  let focusRatingCount = 0;

  for (const session of sessions) {
    totalPlannedMinutes += session.plannedDuration;
    totalActualMinutes += session.actualDuration ?? session.plannedDuration;
    if (session.completedAt !== null) completedSessions += 1;
    if (session.focusRating !== null && session.focusRating !== undefined) {
      focusRatingSum += session.focusRating;
      focusRatingCount += 1;
    }
  }

  const totalSessions = sessions.length;
  return {
    totalSessions,
    completedSessions,
    completionRate: totalSessions === 0 ? 0 : completedSessions / totalSessions,
    totalPlannedMinutes,
    totalActualMinutes,
    averageSessionDuration:
      totalSessions === 0 ? 0 : totalActualMinutes / totalSessions,
    averageFocusRating:
      focusRatingCount === 0 ? null : focusRatingSum / focusRatingCount,
  };
}

/**
 * Group sessions by the local hour they started and return the hours ranked by
 * total minutes spent, so the user can spot their most productive windows.
 */
export function productiveTimes(
  sessions: readonly FocusSession[]
): ProductiveTimeBucket[] {
  const buckets = new Map<number, { totalMinutes: number; sessionCount: number; focusRatingSum: number; focusRatingCount: number }>();

  for (const session of sessions) {
    if (!(session.startedAt instanceof Date) || Number.isNaN(session.startedAt.getTime())) {
      continue;
    }
    const hour = session.startedAt.getHours();
    const current = buckets.get(hour) ?? {
      totalMinutes: 0,
      sessionCount: 0,
      focusRatingSum: 0,
      focusRatingCount: 0,
    };
    current.totalMinutes += sessionMinutes(session);
    current.sessionCount += 1;
    if (session.focusRating !== null && session.focusRating !== undefined) {
      current.focusRatingSum += session.focusRating;
      current.focusRatingCount += 1;
    }
    buckets.set(hour, current);
  }

  return Array.from(buckets.entries())
    .map(([hour, bucket]) => ({
      hour,
      totalMinutes: bucket.totalMinutes,
      sessionCount: bucket.sessionCount,
      averageFocusRating:
        bucket.focusRatingCount === 0
          ? null
          : bucket.focusRatingSum / bucket.focusRatingCount,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}