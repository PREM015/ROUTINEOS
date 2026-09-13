import { describe, expect, it } from 'vitest';
import { buildDefaultStreak, normalizeSummaryPayload, sanitizeNotificationPayload } from '@/lib/feature-helpers';

describe('feature route helpers', () => {
  it('creates a valid empty streak record', () => {
    const streak = buildDefaultStreak();

    expect(streak).toMatchObject({
      currentStreak: 0,
      longestStreak: 0,
      coreStreak: 0,
      growthStreak: 0,
      minimumDayStreak: 0,
      totalCompletedDays: 0,
      totalMinimumDays: 0,
      totalRestDays: 0,
    });
  });

  it('normalizes review summaries and notification payloads', () => {
    const review = normalizeSummaryPayload({
      weekStart: '2026-09-07',
      weekEnd: '2026-09-13',
      overallSatisfaction: '5',
      answers: { focus: 'better planning' },
    });

    expect(review.weekStart).toBe('2026-09-07');
    expect(review.overallSatisfaction).toBe(5);
    expect(review.answers).toEqual({ focus: 'better planning' });

    const notification = sanitizeNotificationPayload({
      type: 'HABIT_REMINDER',
      title: 'Morning check-in',
      body: 'Complete your first habit',
      scheduledFor: '2026-09-13T09:00:00.000Z',
    });

    expect(notification.type).toBe('HABIT_REMINDER');
    expect(notification.title).toBe('Morning check-in');
    expect(notification.status).toBe('PENDING');
  });
});
