import type {
  HabitDefinition,
  Prisma,
  HabitTier,
} from '@/generated/prisma';
import { BaseRepository } from './base.repository';

/**
 * Options for a catalogue browse.
 *
 * Note what is *not* here: no `userId`. A catalogue read is identical for every
 * caller, and adding a user-scoped filter would be the first step towards
 * turning this into a per-user table. The only user-shaped thing the browser
 * layer attaches is `alreadyAdded`, computed by the service from the caller's
 * *own* habits and never by joining the catalogue to someone else's.
 */
export interface HabitDefinitionFindAllOptions {
  category?: string;
  search?: string;
  tier?: HabitTier;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Habit Definition Repository — the shared habit catalogue.
 *
 * System-owned. There is no `userId` column on `HabitDefinition` and no method
 * here that takes one, which is what makes "a catalogue read cannot leak a
 * personal target" a structural property rather than a promise.
 *
 * Writes are gated one layer up, in `HabitCatalogService`, on the session role.
 * This repository stays a dumb data layer like every other repository in the
 * codebase.
 */
export class HabitDefinitionRepository extends BaseRepository {
  /**
   * Browse the catalogue, ordered for display.
   *
   * `sortOrder` first and `name` second so the ordering is total: two entries
   * with the same `sortOrder` still come back in a stable order, which is what
   * a paginated browse needs to avoid duplicating or skipping a row across pages.
   */
  async findAll(options?: HabitDefinitionFindAllOptions): Promise<HabitDefinition[]> {
    try {
      return await this.prisma.habitDefinition.findMany({
        where: this.buildWhere(options),
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: options?.offset,
        take: options?.limit,
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  async countAll(options?: HabitDefinitionFindAllOptions): Promise<number> {
    try {
      return await this.prisma.habitDefinition.count({
        where: this.buildWhere(options),
      });
    } catch (error) {
      this.handleError(error, 'countAll');
    }
  }

  /**
   * One catalogue entry by id.
   *
   * Takes no user id because there is nothing to scope: the row is public to any
   * signed-in user. Personal data is only ever reached by copying *out* of it.
   */
  async findById(id: string): Promise<HabitDefinition | null> {
    try {
      return await this.prisma.habitDefinition.findUnique({ where: { id } });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  async findBySlug(slug: string): Promise<HabitDefinition | null> {
    try {
      return await this.prisma.habitDefinition.findUnique({ where: { slug } });
    } catch (error) {
      this.handleError(error, 'findBySlug');
    }
  }

  /**
   * Resolve many entries at once, keyed by id.
   *
   * The starter pack is applied as a batch, and looking each entry up
   * individually would be a round trip per habit — ~100 of them for the default
   * pack, before the apply itself starts.
   */
  async findByIds(ids: string[]): Promise<HabitDefinition[]> {
    if (ids.length === 0) return [];
    try {
      return await this.prisma.habitDefinition.findMany({
        where: { id: { in: ids } },
      });
    } catch (error) {
      this.handleError(error, 'findByIds');
    }
  }

  async findBySlugs(slugs: string[]): Promise<HabitDefinition[]> {
    if (slugs.length === 0) return [];
    try {
      return await this.prisma.habitDefinition.findMany({
        where: { slug: { in: slugs } },
      });
    } catch (error) {
      this.handleError(error, 'findBySlugs');
    }
  }

  /** Ids of every active entry, for the seed to know what already exists. */
  async findActiveIds(): Promise<string[]> {
    try {
      const rows = await this.prisma.habitDefinition.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    } catch (error) {
      this.handleError(error, 'findActiveIds');
    }
  }

  /**
   * Catalogue rows the given user has already copied.
   *
   * Scoped by `userId` in the `where`, so the answer can only ever contain the
   * caller's own habits. Used to render an "already added" hint without
   * counting anyone's usage for anyone else.
   */
  async findIdsUsedByUser(
    userId: string,
    definitionIds: string[]
  ): Promise<string[]> {
    if (definitionIds.length === 0) return [];
    try {
      const rows = await this.prisma.habit.findMany({
        where: { userId, definitionId: { in: definitionIds } },
        select: { definitionId: true },
      });
      // `definitionId` is nullable but was just filtered to `in`, so every
      // returned value is a real id.
      return rows
        .map((r) => r.definitionId)
        .filter((v): v is string => v !== null);
    } catch (error) {
      this.handleError(error, 'findIdsUsedByUser');
    }
  }

  async create(data: Prisma.HabitDefinitionCreateInput): Promise<HabitDefinition> {
    try {
      return await this.prisma.habitDefinition.create({ data });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  async update(
    id: string,
    data: Prisma.HabitDefinitionUpdateInput
  ): Promise<HabitDefinition> {
    try {
      return await this.prisma.habitDefinition.update({ where: { id }, data });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Deactivate rather than delete.
   *
   * Personal habits copied from a row keep their own values and survive their
   * source disappearing; and `Habit.definitionId` is `onDelete: SetNull`, so a
   * hard delete would silently turn every copy into a "custom" habit and lose
   * the provenance the UI badge depends on.
   */
  async deactivate(id: string): Promise<HabitDefinition> {
    try {
      return await this.prisma.habitDefinition.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      this.handleError(error, 'deactivate');
    }
  }

  /**
   * Create-or-update many entries by slug.
   *
   * Keyed on `slug` because that is the stable identity across environments: a
   * seed re-run must converge on one row per slug rather than appending, and
   * `upsert` with `skipDuplicates` would leave stale fields untouched where an
   * explicit update is what the seed intends.
   *
   * Only `isActive`, `sortOrder` and display fields are overwritten. **Suggested
   * defaults are not reset on re-run**, because a personal habit is a *copy* —
   * once copied it is unaffected either way, but leaving the catalogue's own
   * suggested target alone means an operator's deliberate edit is not silently
   * reverted by a nightly seed.
   */
  async upsertMany(
    rows: Prisma.HabitDefinitionCreateInput[]
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const slug = typeof row.slug === 'string' ? row.slug : null;
      if (!slug) continue;

      const existing = await this.findBySlug(slug);
      if (existing) {
        await this.prisma.habitDefinition.update({
          where: { slug },
          data: {
            name: row.name,
            description: row.description,
            category: row.category,
            icon: row.icon,
            color: row.color,
            sortOrder: row.sortOrder,
            isActive: row.isActive,
          } as Prisma.HabitDefinitionUpdateInput,
        });
        updated += 1;
      } else {
        await this.prisma.habitDefinition.create({ data: row });
        created += 1;
      }
    }

    return { created, updated };
  }

  /**
   * Shared `where` for the browse and its count.
   *
   * Private for the same reason `HabitRepository.buildWhere` is: the row count
   * and the rows must describe the same set, or pagination silently truncates.
   */
  private buildWhere(
    options?: HabitDefinitionFindAllOptions
  ): Prisma.HabitDefinitionWhereInput {
    const where: Prisma.HabitDefinitionWhereInput = {};

    if (!options?.includeInactive) {
      where.isActive = true;
    }

    if (options?.category) {
      where.category = options.category;
    }

    if (options?.tier) {
      where.tier = options.tier;
    }

    const search = options?.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}
