import type { Prisma } from '@/generated/prisma';
import type {
  HabitTier,
  HabitFrequencyType,
  HabitTrackingType,
  HabitDirection,
  TimeOfDay,
  Role,
} from '@/generated/prisma';
import { HabitDefinitionRepository } from '@/server/repositories/habit-definition.repository';
import { ForbiddenError, NotFoundError } from '@/lib/errors/app-error';
import { evaluateCompletion, type CompletableHabit } from '@/lib/habits/completion';
import type {
  HabitDefinitionCard,
  AddFromDefinitionOverrides,
} from '@/types/habit';
import type { UserId } from '@/types/ids';

/**
 * Habit Catalog Service
 *
 * Owns the shared catalogue: browsing it, administering it, and the one write
 * path that turns a catalogue entry into a personal habit.
 *
 * ## The single rule this service exists to enforce
 *
 * A catalogue row is a *suggestion*. Selecting one **copies** its values onto a
 * new `Habit` row owned by the caller; nothing keeps reading the definition
 * afterwards. So:
 *
 *  - two users selecting "Daily Steps" get two rows with two independent
 *    targets (15,000 and 12,000 stay 15,000 and 12,000, forever);
 *  - an admin editing or deactivating a definition cannot change a single
 *    existing personal habit;
 *  - a personal habit's `definitionId` is provenance for a badge, nothing more.
 *
 * The alternative — keeping the personal row live-linked to the definition —
 * would make every catalogue edit a mass rewrite of other people's habits, which
 * is the exact failure this design rules out. `Habit.definitionId`'s doc comment
 * in the schema says the same thing.
 */

export interface CatalogBrowseOptions {
  category?: string;
  search?: string;
  tier?: 'NON_NEGOTIABLE' | 'GROWTH' | 'BONUS' | 'OPTIONAL' | 'EXPERIMENTAL' | 'UNDEFINED' | 'ALTERNATIVE' | 'SPECIAL' | 'FLEXIBLE' | 'JUST_FOR_FUN' | 'LIFESTYLE';
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

export class HabitCatalogService {
  private repository: HabitDefinitionRepository;

  constructor() {
    this.repository = new HabitDefinitionRepository();
  }

  /**
   * Browse the catalogue.
   *
   * Readable by any signed-in user, including inactive entries for admins only.
   * `alreadyAdded` is computed against the **caller's own** habits and is the
   * only user-shaped part of the response; it never counts anybody else's usage.
   */
  async browse(userId: UserId, options: CatalogBrowseOptions = {}) {
    const [rows, total] = await Promise.all([
      this.repository.findAll(options),
      this.repository.countAll(options),
    ]);

    const usedIds = await this.repository.findIdsUsedByUser(
      userId,
      rows.map((r) => r.id)
    );
    const used = new Set(usedIds);

    const data: HabitDefinitionCard[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      tier: row.tier,
      frequencyType: row.frequencyType,
      frequencyValue: row.frequencyValue,
      targetValue: row.targetValue,
      unit: row.unit,
      targetCount: row.targetCount,
      intervalDays: row.intervalDays,
      trackingType: row.trackingType,
      direction: row.direction,
      timeOfDay: row.timeOfDay,
      linkedMetricType: row.linkedMetricType,
      icon: row.icon,
      color: row.color,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      alreadyAdded: used.has(row.id),
    }));

    return {
      definitions: data,
      total,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    };
  }

  /** A single entry. `null` when it does not exist or is inactive. */
  async getById(id: string) {
    const row = await this.repository.findById(id);
    if (!row || !row.isActive) return null;
    return row;
  }

  /** Admin-only catalogue write. */
  async createDefinition(
    role: Role | undefined,
    input: Prisma.HabitDefinitionCreateInput
  ) {
    this.assertAdmin(role);
    return this.repository.create(input);
  }

  async updateDefinition(
    role: Role | undefined,
    id: string,
    input: Prisma.HabitDefinitionUpdateInput
  ) {
    this.assertAdmin(role);
    const existing = await this.repository.findById(id);
    if (!existing) return null;
    return this.repository.update(id, input);
  }

  /**
   * Hide a catalogue entry.
   *
   * Deactivate, not delete. Personal habits that were copied from it keep
   * working and keep their provenance badge; a hard delete would `SetNull` every
   * `definitionId` and silently reclassify real habits as custom.
   */
  async deactivateDefinition(role: Role | undefined, id: string) {
    this.assertAdmin(role);
    const existing = await this.repository.findById(id);
    if (!existing) return null;
    return this.repository.deactivate(id);
  }

  /**
   * The values a personal habit would get if selected right now.
   *
   * Exported as a pure function so the "add from catalogue" form can show the
   * user exactly what they are about to save, and so a test can assert that an
   * override actually wins over the suggestion — the mechanism by which
   * "15,000 for me, 12,000 for you, 30 for someone else" is possible at all.
   */
  static resolvePersonalValues(
    definition: {
      name: string;
      description: string | null;
      tier: HabitTier;
      icon: string | null;
      color: string | null;
      trackingType: HabitTrackingType;
      direction: HabitDirection;
      targetValue: number | null;
      unit: string | null;
      targetCount: number | null;
      frequencyType: HabitFrequencyType;
      frequencyValue: string | null;
      intervalDays: number | null;
      timeOfDay: TimeOfDay | null;
    },
    overrides: AddFromDefinitionOverrides = {}
  ) {
    return {
      name: overrides.name ?? definition.name,
      description:
        overrides.description !== undefined
          ? overrides.description
          : definition.description,
      tier: overrides.tier ?? definition.tier,
      icon: overrides.icon !== undefined ? overrides.icon : definition.icon,
      color: overrides.color !== undefined ? overrides.color : definition.color,
      trackingType: overrides.trackingType ?? definition.trackingType,
      direction: overrides.direction ?? definition.direction,
      targetValue:
        overrides.targetValue !== undefined
          ? overrides.targetValue
          : definition.targetValue,
      unit: overrides.unit !== undefined ? overrides.unit : definition.unit,
      targetCount:
        overrides.targetCount !== undefined
          ? overrides.targetCount
          : definition.targetCount,
      frequencyType: overrides.frequencyType ?? definition.frequencyType,
      frequencyValue:
        overrides.frequencyValue !== undefined
          ? overrides.frequencyValue
          : definition.frequencyValue,
      // A gap only survives on an interval habit. Switching to DAILY and leaving
      // `intervalDays` behind would make `isHabitScheduledForDate` ignore it
      // silently, and the value would sit on the row looking meaningful.
      intervalDays:
        (overrides.frequencyType ?? definition.frequencyType) === 'EVERY_N_DAYS'
          ? overrides.intervalDays !== undefined
            ? overrides.intervalDays
            : definition.intervalDays
          : null,
      timeOfDay:
        overrides.timeOfDay !== undefined
          ? overrides.timeOfDay
          : definition.timeOfDay,
    };
  }

  private assertAdmin(role: Role | undefined) {
    if (role !== 'ADMIN') {
      throw new ForbiddenError('Admin role required to modify the habit catalogue');
    }
  }
}

/**
 * Re-exported so a caller can preview a completion *before* writing the habit,
 * using the exact same rule the server will use afterwards. Duplicating this
 * comparison in a client component is how "the preview said complete but the app
 * said incomplete" bugs happen.
 */
export { evaluateCompletion };
export type { CompletableHabit };

/**
 * Thrown when a caller tries to touch another user's personal habit.
 *
 * Extends `NotFoundError` (404) rather than `ValidationError` (400) on purpose:
 * answering "403, this habit is not yours" confirms the id exists, which is
 * exactly the existence leak the requirement forbids. The message is identical
 * to the not-found message so the two cases are indistinguishable from outside.
 */
export class HabitOwnershipError extends NotFoundError {
  constructor() {
    super('Habit');
  }
}
