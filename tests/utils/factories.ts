import { makeGoal, makeHabit } from './db';

export { makeGoal, makeHabit };

export interface RecordOverrides {
  [key: string]: unknown;
}

export function makeTask(overrides: RecordOverrides = {}) {
  return {
    id: 'task-1',
    userId: 'user-1',
    title: 'Write report',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: null,
    scheduledFor: null,
    estimatedMinutes: null,
    actualMinutes: null,
    isUrgent: false,
    isImportant: true,
    projectId: null,
    goalId: null,
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeProject(overrides: RecordOverrides = {}) {
  return {
    id: 'project-1',
    userId: 'user-1',
    name: 'Launch blog',
    description: null,
    status: 'ACTIVE',
    progress: 50,
    startDate: '2026-01-05',
    endDate: '2026-06-30',
    color: '#6366f1',
    goalId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeMoodLog(date: string, mood: number, energy: number | null = null) {
  return { date, mood, energy };
}

export function makeEnergyPoint(date: string, time: string, energy: number) {
  return { date, time, energy };
}

export function makeScore(overrides: RecordOverrides = {}) {
  return {
    id: 'score-1',
    userId: 'user-1',
    date: '2026-09-17',
    coreScore: 80,
    habitScore: 80,
    focusScore: 80,
    totalScore: 80,
    status: 'COMPLETED',
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeFocusSession(overrides: RecordOverrides = {}) {
  return {
    id: 'focus-1',
    userId: 'user-1',
    startedAt: new Date('2026-09-17T09:00:00.000Z'),
    endedAt: null,
    plannedDuration: 25,
    actualDuration: null,
    completedAt: null,
    focusRating: null,
    isProductive: true,
    createdAt: new Date('2026-09-17T09:00:00.000Z'),
    ...overrides,
  };
}

export function makeJournalEntry(overrides: RecordOverrides = {}) {
  return {
    id: 'journal-1',
    userId: 'user-1',
    date: '2026-09-17',
    title: 'A productive day',
    content: 'Wrote several pages and cleared the inbox.',
    mood: null,
    energy: null,
    gratitude: null,
    isFavorite: false,
    isArchived: false,
    createdAt: new Date('2026-09-17T12:00:00.000Z'),
    updatedAt: new Date('2026-09-17T12:00:00.000Z'),
    tags: [],
    ...overrides,
  };
}

export function makeIntegration(overrides: RecordOverrides = {}) {
  return {
    id: 'integration-1',
    userId: 'user-1',
    provider: 'GOOGLE_CALENDAR',
    isActive: true,
    scopes: ['calendar.readonly'],
    accessToken: 'access-token-1',
    refreshToken: null,
    expiresAt: null,
    lastSyncedAt: null,
    syncError: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}