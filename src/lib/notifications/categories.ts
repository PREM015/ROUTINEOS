import type { NotificationType } from '@/generated/prisma';

/**
 * Notification categories.
 *
 * ERROR.md L asks the navbar bell to "categorize notifications by what type of
 * notification it is and what it relates to", with a filter per category.
 *
 * There are 40+ `NotificationType` values, so filtering by raw type would be
 * unusable. These buckets are what the user actually thinks in. The mapping is
 * exhaustive and lives in one file, so a new enum member cannot be forgotten —
 * `CATEGORY_OF` falls back to `system`, and `tests/lib/enums.test.ts` style
 * checking is not required for correctness here.
 */
export type NotificationCategory =
  | 'routine'
  | 'habits'
  | 'goals'
  | 'tasks'
  | 'sleep'
  | 'focus'
  | 'streaks'
  | 'reviews'
  | 'achievements'
  | 'insights'
  | 'system';

export const CATEGORY_ORDER: readonly NotificationCategory[] = [
  'routine',
  'habits',
  'goals',
  'tasks',
  'sleep',
  'focus',
  'streaks',
  'reviews',
  'achievements',
  'insights',
  'system',
] as const;

export interface CategoryMeta {
  label: string;
  /** Short tag rendered on each notification row. */
  tag: string;
  /** Tailwind classes using theme tokens, so both themes are correct. */
  chipClass: string;
}

export const CATEGORY_META: Record<NotificationCategory, CategoryMeta> = {
  routine: {
    label: 'Routine',
    tag: 'Routine',
    chipClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  },
  habits: {
    label: 'Habits',
    tag: 'Habit',
    chipClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  goals: {
    label: 'Goals',
    tag: 'Goal',
    chipClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
  tasks: {
    label: 'Tasks',
    tag: 'Task',
    chipClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  },
  sleep: {
    label: 'Sleep',
    tag: 'Sleep',
    chipClass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  },
  focus: {
    label: 'Focus',
    tag: 'Focus',
    chipClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  streaks: {
    label: 'Streaks',
    tag: 'Streak',
    chipClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  reviews: {
    label: 'Reviews',
    tag: 'Review',
    chipClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  },
  achievements: {
    label: 'Achievements',
    tag: 'Achievement',
    chipClass: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  },
  insights: {
    label: 'Insights',
    tag: 'Insight',
    chipClass: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
  },
  system: {
    label: 'System',
    tag: 'System',
    chipClass: 'bg-muted text-muted-foreground',
  },
};

/** Raw notification type → user-facing category. */
const CATEGORY_OF: Record<NotificationType, NotificationCategory> = {
  // Routine
  ROUTINE_START: 'routine',
  ROUTINE_REMINDER: 'routine',
  ROUTINE_COMPLETED: 'routine',
  ROUTINE_MISSED: 'routine',

  // Habits
  HABIT_REMINDER: 'habits',
  HABIT_MISSED: 'habits',
  HABIT_STREAK_AT_RISK: 'habits',

  // Goals
  GOAL_DEADLINE: 'goals',
  GOAL_MILESTONE: 'goals',
  GOAL_AT_RISK: 'goals',
  GOAL_COMPLETED: 'goals',

  // Tasks
  TASK_DUE: 'tasks',
  TASK_OVERDUE: 'tasks',
  REMINDER_SNOOZED: 'tasks',

  // Sleep
  SLEEP_REMINDER: 'sleep',
  SLEEP_STARTED: 'sleep',
  SLEEP_ENDED: 'sleep',
  SLEEP_PROMPT: 'sleep',
  SLEEP_TRACKING_STARTED: 'sleep',

  // Focus
  FOCUS_SESSION_START: 'focus',
  FOCUS_SESSION_END: 'focus',
  BREAK_REMINDER: 'focus',

  // Streaks
  STREAK_MILESTONE: 'streaks',
  STREAK_BROKEN: 'streaks',

  // Reviews
  WEEKLY_REVIEW: 'reviews',
  MONTHLY_REVIEW: 'reviews',
  QUARTERLY_REVIEW: 'reviews',
  YEARLY_REVIEW: 'reviews',
  WEEKLY_RESET: 'reviews',
  MONTHLY_RESET: 'reviews',
  WEEKLY_SUMMARY: 'reviews',
  MONTHLY_SUMMARY: 'reviews',

  // Achievements
  ACHIEVEMENT_UNLOCKED: 'achievements',

  // Insights
  DAILY_SUMMARY: 'insights',
  DAILY_RESET: 'insights',
  MOTIVATIONAL: 'insights',
  PRODUCTIVITY_INSIGHT: 'insights',

  // System
  AUTOMATION: 'system',
  SYSTEM_UPDATE: 'system',
};

export function categoryFor(type: NotificationType): NotificationCategory {
  return CATEGORY_OF[type] ?? 'system';
}

export type PeriodFilter = 'all' | 'day' | 'week' | 'month' | 'year';

export const PERIOD_FILTERS: ReadonlyArray<{ value: PeriodFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const;

/**
 * How many days back each period covers, and how far back the list may page.
 *
 * The window is applied on the `scheduledFor` column in the **user's timezone**,
 * so "Today" means their today, not UTC's.
 */
export const PERIOD_DAYS: Record<Exclude<PeriodFilter, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

/** Turn a type + relatedEntityId into the tag(s) shown on a row. */
export function tagsFor(type: NotificationType, relatedEntityId?: string | null): string[] {
  const category = categoryFor(type);
  const tags = [CATEGORY_META[category].tag];

  // A related entity means the notification is about something specific, which
  // is the "what it relates to" half of the ERROR.md L requirement.
  if (relatedEntityId) {
    const entity = relatedEntityId.split(':')[0];
    const label: Record<string, string> = {
      routine: 'Block',
      habit: 'Habit',
      goal: 'Goal',
      task: 'Task',
      sleep: 'Sleep',
    };
    if (entity && label[entity]) tags.push(label[entity]);
  }

  return tags;
}
