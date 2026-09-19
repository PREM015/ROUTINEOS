export interface GoalOverrides {
  [key: string]: unknown;
}

export interface HabitOverrides {
  [key: string]: unknown;
}

export interface MonthOverrides {
  [key: string]: unknown;
}

export interface SleepMidnightOverrides {
  [key: string]: unknown;
}

export function makeGoal(overrides: GoalOverrides = {}) {
  return {
    id: 'goal-1',
    userId: 'user-1',
    title: 'Read 12 books',
    description: null,
    type: 'WEEKLY',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    targetValue: 12,
    currentValue: 3,
    startDate: '2026-01-05',
    endDate: '2026-12-27',
    carryOverCount: 0,
    originalGoalId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeHabit(overrides: HabitOverrides = {}) {
  return {
    id: 'habit-1',
    userId: 'user-1',
    name: 'Morning run',
    description: null,
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetPerWeek: 7,
    color: '#10b981',
    isArchived: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeMonth(overrides: MonthOverrides = {}) {
  return {
    id: 'month-1',
    userId: 'user-1',
    month: 1,
    year: 2026,
    monthKey: '2026-01',
    goalsCompletedCount: 0,
    habitsCompletionRate: null,
    averageScore: null,
    isCompleted: false,
    note: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeSleepMidnight(overrides: SleepMidnightOverrides = {}) {
  return {
    id: 'sleep-1',
    userId: 'user-1',
    date: '2026-09-16',
    actualBedtime: '23:30',
    actualWakeTime: '06:30',
    durationMinutes: 420,
    quality: 4,
    isRecoveryDay: false,
    isSleepMidnight: true,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    updatedAt: new Date('2026-09-17T00:00:00.000Z'),
    ...overrides,
  };
}