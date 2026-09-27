import type { PrismaClient, Prisma } from '@/generated/prisma';
import type {
  ImportGoalInput,
  ImportHabitInput,
} from '@/lib/validation/import.schema';
import { createLogger } from '@/lib/monitoring/logger';

/**
 * Data Importer
 *
 * Applies an import payload back into the database. Import is entity-merge,
 * never wipe: nothing is ever deleted.
 *
 * The Prisma client is passed in rather than imported so this module can be
 * reused outside a request. Only `ImportService` constructs that handle.
 *
 * Two constraints shape this module, both discovered from the real contract:
 *
 * 1. `importHabitSchema`/`importGoalSchema` carry `YYYY-MM-DD` **strings** and
 *    free-text `category`/`tags` names, not Prisma relations. The previous
 *    implementation spread the whole row straight into `create`, so any row
 *    containing `category`, `tags`, or a date string was rejected by Prisma
 *    with an unknown-argument error — i.e. real imports silently failed. Dates
 *    are now coerced to UTC `Date`s, and name-shaped fields are dropped with a
 *    warning rather than pushed at the database.
 * 2. Only scalar columns are written. Relation wiring (`tagIds`, `dayTypeIds`)
 *    needs the target rows to exist, and `category` is a name rather than a
 *    cuid, so neither is materialised here. Ownership and identity are always
 *    set by the server from `userId`; a payload can never choose them.
 */

const log = createLogger('importer');

/**
 * Parse a `YYYY-MM-DD` calendar date as UTC midnight. Parsing via `new Date()`
 * on a bare date string is UTC, but being explicit avoids a local-timezone
 * shift moving the row onto the previous or next day.
 */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Keys a habit payload may carry that the importer cannot persist. */
const DROPPED_HABIT_FIELDS = ['category', 'tags'] as const;
/** Keys a goal payload may carry that the importer cannot persist. */
const DROPPED_GOAL_FIELDS = ['tags'] as const;

function warnDropped(
  entity: 'habit' | 'goal',
  fields: ReadonlyArray<string>,
  count: number
): void {
  if (count === 0) return;
  log.warn(
    `Import dropped ${fields.join(', ')} from ${count} ${entity} row(s)`,
    { fields: [...fields], count }
  );
}

/**
 * Build a habit insert from a payload row. Optional keys the caller did not
 * supply are omitted entirely so Prisma applies column defaults.
 */
function toHabitData(userId: string, habit: ImportHabitInput): Prisma.HabitUncheckedCreateInput {
  const data: Prisma.HabitUncheckedCreateInput = {
    userId,
    name: habit.name,
    tier: habit.tier,
    frequencyType: habit.frequencyType,
  };

  if (habit.description !== undefined) data.description = habit.description;
  if (habit.color !== undefined) data.color = habit.color;
  if (habit.icon !== undefined) data.icon = habit.icon;
  if (habit.frequencyValue !== undefined) data.frequencyValue = habit.frequencyValue;
  if (habit.targetCount !== undefined) data.targetCount = habit.targetCount;
  if (habit.startDate !== undefined) data.startDate = toDate(habit.startDate);
  if (habit.endDate != null) data.endDate = toDate(habit.endDate);
  if (habit.reminderTime !== undefined) data.reminderTime = habit.reminderTime;
  if (habit.reminderEnabled !== undefined) data.reminderEnabled = habit.reminderEnabled;
  if (habit.points !== undefined) data.points = habit.points;
  if (habit.estimatedDuration !== undefined) data.estimatedDuration = habit.estimatedDuration;
  if (habit.difficulty !== undefined) data.difficulty = habit.difficulty;

  return data;
}

/** Build a goal insert from a payload row, for the same reasons as habits. */
function toGoalData(userId: string, goal: ImportGoalInput): Prisma.GoalUncheckedCreateInput {
  const data: Prisma.GoalUncheckedCreateInput = {
    userId,
    title: goal.title,
    type: goal.type,
    targetValue: goal.targetValue,
    startDate: toDate(goal.startDate),
    endDate: toDate(goal.endDate),
  };

  if (goal.description !== undefined) data.description = goal.description;
  if (goal.priority !== undefined) data.priority = goal.priority;
  if (goal.currentValue !== undefined) data.currentValue = goal.currentValue;
  if (goal.unit !== undefined) data.unit = goal.unit;
  if (goal.status !== undefined) data.status = goal.status;

  return data;
}

/**
 * Create habits from an import payload. Returns the number written.
 */
export async function importHabits(
  userId: string,
  habits: ReadonlyArray<ImportHabitInput>,
  db: PrismaClient
): Promise<number> {
  warnDropped(
    'habit',
    DROPPED_HABIT_FIELDS,
    habits.filter((h) => DROPPED_HABIT_FIELDS.some((f) => h[f] !== undefined)).length
  );

  let count = 0;
  for (const habit of habits) {
    await db.habit.create({ data: toHabitData(userId, habit) });
    count += 1;
  }

  return count;
}

/**
 * Create goals from an import payload. Returns the number written.
 */
export async function importGoals(
  userId: string,
  goals: ReadonlyArray<ImportGoalInput>,
  db: PrismaClient
): Promise<number> {
  warnDropped(
    'goal',
    DROPPED_GOAL_FIELDS,
    goals.filter((g) => DROPPED_GOAL_FIELDS.some((f) => g[f] !== undefined)).length
  );

  let count = 0;
  for (const goal of goals) {
    await db.goal.create({ data: toGoalData(userId, goal) });
    count += 1;
  }

  return count;
}
