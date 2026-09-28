import { RoutineRepository } from '@/server/repositories/routine.repository';

/**
 * Day Type Service
 *
 * Business rules for `DayTypeDefinition` â€” the user-defined day types that
 * habits and goals are assigned to.
 *
 * These rules used to live inline in `app/api/day-types/route.ts`, which meant
 * they were unreachable from any other caller, untestable without a database,
 * and unshared: the "Add Day Type" button silently misbehaved because slug
 * normalisation and default-flag exclusivity only existed in that one handler.
 * There is exactly one implementation of each rule, here.
 */

export interface CreateDayTypeInput {
  name: string;
  slug: string;
  description?: string;
  color?: string;
  icon?: string;
  isDefault?: boolean;
  sortOrder?: number;
}

export interface UpdateDayTypeInput {
  name?: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isDefault?: boolean;
  sortOrder?: number;
  isArchived?: boolean;
}

/**
 * Normalise a user-entered slug: trim, lowercase, collapse spaces/underscores
 * to hyphens, and strip anything that is not a valid slug character.
 *
 * Without this, "Work Day" and "work-day" are two different day types to the
 * unique index, and `ENUM_TO_SLUG`-style lookups miss.
 */
export function normalizeDayTypeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class DayTypeService {
  private routineRepository: RoutineRepository;

  constructor() {
    this.routineRepository = new RoutineRepository();
  }

  /**
   * All day types for a user, in display order.
   */
  async listDayTypes(userId: string) {
    return this.routineRepository.listDayTypeDefinitions(userId);
  }

  /**
   * Every day type, including archived ones, with usage counts.
   *
   * The management page needs both: it must be able to *see* an archived day
   * type (and un-archive it), and it reads `_count` to decide whether
   * archiving is safe. `listDayTypes` filters `isArchived` and passes no
   * `include`, so Prisma rejects `_count` on it at runtime — the two lists are
   * not interchangeable.
   */
  async listAllDayTypes(userId: string) {
    return this.routineRepository.listDayTypeDefinitionsWithCounts(userId);
  }

  async getDayType(userId: string, dayTypeId: string) {
    return this.routineRepository.findDayTypeDefinitionById(dayTypeId, userId);
  }

  /**
   * Create a day type.
   *
   * Enforces slug uniqueness per user and the "at most one default" invariant.
   */
  async createDayType(userId: string, input: CreateDayTypeInput) {
    const slug = normalizeDayTypeSlug(input.slug);
    if (!slug) {
      throw new Error('Slug must contain at least one letter or number');
    }

    const existing = await this.routineRepository.findDayTypeDefinitionBySlug(userId, slug);
    if (existing) {
      throw new Error('A day type with this slug already exists');
    }

    // Only one default may exist per user, so clear the others first.
    if (input.isDefault) {
      await this.routineRepository.clearDefaultDayTypeFlags(userId);
    }

    const dayType = await this.routineRepository.createDayTypeDefinition({
      user: { connect: { id: userId } },
      name: input.name,
      slug,
      description: input.description,
      color: input.color,
      icon: input.icon,
      isDefault: input.isDefault ?? false,
      sortOrder: input.sortOrder ?? 0,
    });

    return dayType;
  }

  /**
   * Update a day type, preserving both invariants.
   */
  async updateDayType(userId: string, dayTypeId: string, input: UpdateDayTypeInput) {
    const current = await this.routineRepository.findDayTypeDefinitionById(dayTypeId, userId);
    if (!current) {
      throw new Error('Day type not found');
    }

    let slug: string | undefined;
    if (input.slug !== undefined) {
      slug = normalizeDayTypeSlug(input.slug);
      if (!slug) {
        throw new Error('Slug must contain at least one letter or number');
      }
      const clash = await this.routineRepository.findDayTypeDefinitionBySlug(userId, slug);
      if (clash && clash.id !== dayTypeId) {
        throw new Error('A day type with this slug already exists');
      }
    }

    if (input.isDefault) {
      await this.routineRepository.clearDefaultDayTypeFlags(userId);
    }

    const updated = await this.routineRepository.updateDayTypeDefinition(dayTypeId, userId, {
      ...(input.name !== undefined && { name: input.name }),
      ...(slug !== undefined && { slug }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
    });

    return updated;
  }

  /**
   * Delete a day type. Refuses when it is the user's only default, so the
   * "a default always exists" expectation is not silently broken.
   */
  /**
   * Archive a day type (soft delete).
   *
   * Sets `isArchived` rather than removing the row, because a
   * `RoutineException`, `RoutineTemplate` or `HabitDayType` may still point at
   * it. The FKs are `onDelete: SetNull`, so a hard delete silently detached
   * every template, exception and habit assignment that referenced the day
   * type — the user's schedule appeared to lose its custom day types without
   * any warning. Archived rows are filtered out of pickers and the template
   * list, but existing exceptions keep resolving via their own `dayType`
   * column.
   */
  async archiveDayType(userId: string, dayTypeId: string) {
    const current = await this.routineRepository.findDayTypeDefinitionById(dayTypeId, userId);
    if (!current) {
      throw new Error('Day type not found');
    }

    const all = await this.routineRepository.listDayTypeDefinitionsWithCounts(userId);
    const active = all.filter((d) => !d.isArchived);

    if (current.isDefault && active.length === 1) {
      throw new Error('Cannot archive your only active day type');
    }
    // A default day type is one of the five seeded by onboarding, which the
    // natural-weekday resolution looks up by slug. Archiving one would make
    // every ordinary Monday fall back to a null day-type id.
    if (current.isDefault) {
      throw new Error('Cannot archive a default day type');
    }

    return this.routineRepository.archiveDayTypeDefinition(dayTypeId, userId);
  }

  /**
   * Restore a previously archived day type.
   */
  async unarchiveDayType(userId: string, dayTypeId: string) {
    const current = await this.routineRepository.findDayTypeDefinitionById(dayTypeId, userId);
    if (!current) {
      throw new Error('Day type not found');
    }
    return this.routineRepository.unarchiveDayTypeDefinition(dayTypeId, userId);
  }

  /**
   * Hard delete, for the explicit "remove completely" case (`?permanent=true`).
   *
   * Refused for a day type that is still referenced, because the FKs are
   * `onDelete: SetNull` and the delete would silently detach templates,
   * exceptions and habit assignments rather than refusing. Archive first.
   */
  async deleteDayType(userId: string, dayTypeId: string) {
    const current = await this.routineRepository.findDayTypeDefinitionById(dayTypeId, userId);
    if (!current) {
      throw new Error('Day type not found');
    }

    const all = await this.routineRepository.listDayTypeDefinitionsWithCounts(userId);
    const counts = all.find((d) => d.id === dayTypeId)?._count;
    if (
      counts &&
      (counts.routineTemplates > 0 ||
        counts.routineExceptions > 0 ||
        counts.habitAssignments > 0 ||
        counts.goalAssignments > 0)
    ) {
      throw new Error(
        'This day type is still in use. Archive it instead to keep existing data linked.'
      );
    }

    return this.routineRepository.deleteDayTypeDefinition(dayTypeId, userId);
  }
}
