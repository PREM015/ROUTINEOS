export type StreakRecord = {
  userId?: string;
  currentStreak: number;
  longestStreak: number;
  coreStreak: number;
  growthStreak: number;
  minimumDayStreak: number;
  streakStartDate?: string | null;
  lastCompletedDate?: string | null;
  totalCompletedDays: number;
  totalMinimumDays: number;
  totalRestDays: number;
  updatedAt?: Date;
};

export function buildDefaultStreak(overrides: Partial<StreakRecord> = {}): StreakRecord {
  return {
    currentStreak: 0,
    longestStreak: 0,
    coreStreak: 0,
    growthStreak: 0,
    minimumDayStreak: 0,
    streakStartDate: null,
    lastCompletedDate: null,
    totalCompletedDays: 0,
    totalMinimumDays: 0,
    totalRestDays: 0,
    ...overrides,
  };
}

export function normalizeSummaryPayload(input: Record<string, any>) {
  const parsed = typeof input === 'object' && input ? input : {};

  const weekStart = typeof parsed.weekStart === 'string' ? parsed.weekStart : '';
  const weekEnd = typeof parsed.weekEnd === 'string' ? parsed.weekEnd : '';
  const overallSatisfaction = Number(parsed.overallSatisfaction ?? 0);
  const answers = parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {};

  return {
    weekStart,
    weekEnd,
    overallSatisfaction: Number.isFinite(overallSatisfaction) ? Math.min(5, Math.max(1, Math.round(overallSatisfaction))) : 3,
    answers,
  };
}

export function sanitizeNotificationPayload(input: Record<string, any>) {
  const data = typeof input === 'object' && input ? input : {};
  const type = typeof data.type === 'string' ? data.type : 'DAILY_SUMMARY';
  const title = typeof data.title === 'string' ? data.title.trim() : 'Daily update';
  const body = typeof data.body === 'string' ? data.body.trim() : '';
  const scheduledFor = typeof data.scheduledFor === 'string' ? data.scheduledFor : new Date().toISOString();

  return {
    type,
    title: title || 'Daily update',
    body: body || 'You have a new update.',
    scheduledFor,
    status: 'PENDING',
  };
}
