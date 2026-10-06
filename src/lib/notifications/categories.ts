import type { NotificationType } from '@/generated/prisma';

/**
 * Notification categories, tags and filters.
 *
 * ERROR.md L asks for the navbar bell to categorise notifications "by what type
 * of notification it is and what it relates to", show tags, and offer filters
 * for both category and period.
 *
 * The user then asked for two more things:
 *
 *   1. the **labels they set on routine blocks** (DSA, Personal, GATE,
 *      College, Health, ...) to appear as tags and be filterable. Those are
 *      stored on `RoutineBlock.categoryId -> Category.name`, so the producer
 *      captures the name into the notification's `actionData.category`.
 *   2. filters for Habit, Achievement, Recap, Analytics, Focus mode, Journal
 *      and Settings alongside the existing ones.
 *
 * There are 40+ `NotificationType` values, so filtering by raw type would be
 * unusable. These buckets are what the user actually thinks in. The mapping is
 * exhaustive and lives in one file, and anything unmapped falls back to
 * `system` rather than disappearing.
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
  | 'journal'
  | 'settings'
  | 'system';

/**
 * Filter order and labels.
 *
 * `reviews` is labelled "Recap" and `insights` "Analytics" because that is the
 * vocabulary the user asked for. `journal` is present as a filter, but note
 * there is currently **no** `NotificationType` for journal entries, so it will
 * show zero until journal reminders are implemented — it is not hidden, because
 * hiding it would make the absence invisible.
 */
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
  'journal',
  'settings',
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
    label: 'Habit',
    tag: 'Habit',
    chipClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  goals: {
    label: 'Goal',
    tag: 'Goal',
    chipClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
  tasks: {
    label: 'Task',
    tag: 'Task',
    chipClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  },
  sleep: {
    label: 'Sleep',
    tag: 'Sleep',
    chipClass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  },
  focus: {
    label: 'Focus mode',
    tag: 'Focus',
    chipClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  streaks: {
    label: 'Streak',
    tag: 'Streak',
    chipClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  reviews: {
    label: 'Recap',
    tag: 'Recap',
    chipClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  },
  achievements: {
    label: 'Achievement',
    tag: 'Achievement',
    chipClass: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  },
  insights: {
    label: 'Analytics',
    tag: 'Analytics',
    chipClass: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
  },
  journal: {
    label: 'Journal',
    tag: 'Journal',
    chipClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  },
  settings: {
    label: 'Settings',
    tag: 'Settings',
    chipClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
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
  GOAL_CHECKIN: 'goals',

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
  SLEEP_PRE_WARNING: 'sleep',
  SLEEP_WAKE_CONFIRMATION: 'sleep',

  // Enhanced routine notifications
  ROUTINE_PRE_START: 'routine',
  ROUTINE_COMPLETION: 'routine',
  ROUTINE_END_REMINDER: 'routine',

  // Enhanced habit notifications
  HABIT_PRE_START: 'habits',
  HABIT_COMPLETION: 'habits',

  // Focus
  FOCUS_SESSION_START: 'focus',
  FOCUS_SESSION_END: 'focus',
  BREAK_REMINDER: 'focus',

  // Streaks
  STREAK_MILESTONE: 'streaks',
  STREAK_BROKEN: 'streaks',

  // Recap (weekly / monthly / quarterly / yearly review and reset)
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

  // Analytics / insights
  DAILY_SUMMARY: 'insights',
  DAILY_RESET: 'insights',
  MOTIVATIONAL: 'insights',
  PRODUCTIVITY_INSIGHT: 'insights',

  // Journal
  //
  // There is no `NotificationType` for journal entries, so nothing maps here
  // yet. The `journal` filter is still offered so the absence is visible
  // rather than hidden — and it will start working the day a journal reminder
  // type is added, with no change to this file's shape beyond one line.
  //
  // It is deliberately NOT faked with a synthetic type: inventing an enum
  // member here would need a schema change and a migration, and would report a
  // filter as working when nothing can ever produce it.

  // Settings / system
  AUTOMATION: 'settings',
  SYSTEM_UPDATE: 'settings',
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

/** What a notification is about, for the "relates to" half of ERROR.md L. */
export interface NotificationTags {
  /** The category tag, e.g. "Routine". */
  category: string;
  /** The user's own label for a routine block, e.g. "DSA" or "Personal". */
  userCategory: string | null;
  /** The entity the notification is attached to, e.g. "Block" or "Goal". */
  entity: string | null;
  /** Everything above, in display order, de-duplicated. */
  all: string[];
}

/**
 * Label for the entity a notification is about.
 *
 * `focus` is here because `NotificationCategory` has a `'focus'` bucket - so the
 * category mapping already routed focus notifications correctly, but the entity lookup
 * returned `undefined` for them and the label rendered blank. The two tables were
 * written at different times and only one of them was updated when the focus domain
 * arrived.
 */
const ENTITY_LABEL: Record<string, string> = {
  routine: 'Block',
  habit: 'Habit',
  goal: 'Goal',
  task: 'Task',
  sleep: 'Sleep',
  focus: 'Session',
};

/**
 * Build the tag set for a notification.
 *
 * @param type             The `NotificationType`.
 * @param relatedEntityId  `<entity>:<id>:<localDate>` for scheduled rows.
 * @param userCategory     The block's own label, read from `actionData.category`
 *                         at schedule time. `null` for non-routine rows.
 */
export function tagsFor(
  type: NotificationType,
  relatedEntityId?: string | null,
  userCategory?: string | null
): NotificationTags {
  const category = CATEGORY_META[categoryFor(type)]?.tag ?? 'System';

  let entity: string | null = null;
  if (relatedEntityId) {
    const key = relatedEntityId.split(':')[0];
    entity = key && ENTITY_LABEL[key] ? ENTITY_LABEL[key] : null;
  }

  const all: string[] = [category];
  if (userCategory) all.push(userCategory);
  if (entity) all.push(entity);

  return {
    category,
    userCategory: userCategory ?? null,
    entity,
    all: [...new Set(all)],
  };
}

/** A stable, comparable key for filtering on a user-defined tag. */
export function normaliseTag(tag: string): string {
  return tag.trim().toLowerCase();
}
