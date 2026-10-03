import type { FocusSettings, FocusPreset, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Focus Settings and Preset Repository
 *
 * Two one-to-one / one-to-many models that used to be `localStorage`. Server-owned
 * so the settings follow the user across devices, with `localStorage` reduced to a
 * cache (see `hooks/useFocusSettings`).
 *
 * The split from `UserSettings` is deliberate. `UserSettings` is already ~90
 * columns with its own validation schema and its own settings pages; adding seven
 * more focus-specific fields there would mean every one of those pages' schemas
 * has to learn about focus, and a focus preference would be editable from two
 * unrelated places.
 *
 * Master switches stay on `UserSettings` and are **read, never duplicated here**:
 * `soundEnabled` there is the master gate, `timezone` is the master zone,
 * `focusReminders`/`breakReminders` are the master reminder gates.
 */

export interface UpsertFocusSettingsData {
  focusMinutes?: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
  cyclesBeforeLongBreak?: number;
  autoStartBreak?: boolean;
  autoStartFocus?: boolean;
  keepScreenAwake?: boolean;
  reflectionMode?: FocusSettings['reflectionMode'];
  reflectionMinimumMinutes?: number;
  dailyTargetMinutes?: number;
  streakDayMinutes?: number;
  weeklyTargetMinutes?: number | null;
  soundEnabled?: boolean;
  soundVolume?: number;
  ambientSound?: string | null;
  showWallClock?: boolean;
  breakSuggestions?: boolean;
  adaptiveSuggestions?: boolean;
}

export interface UpsertFocusPresetData {
  name: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  categoryId?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

/**
 * The three presets seeded on first use.
 *
 * Seeded rather than shipped as hard-coded pills so they are editable and
 * deletable like any other preset. Chosen to span the range people actually use
 * — 25/5 classic, 50/10 deep work, 90/20 for a long block — so the first run is
 * useful without configuration.
 */
export const DEFAULT_PRESETS: ReadonlyArray<
  Omit<UpsertFocusPresetData, 'sortOrder'>
> = [
  { name: 'Classic', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4 },
  { name: 'Deep work', focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 20, cyclesBeforeLongBreak: 3 },
  { name: 'Long block', focusMinutes: 90, shortBreakMinutes: 20, longBreakMinutes: 30, cyclesBeforeLongBreak: 2 },
];

export class FocusSettingsRepository extends BaseRepository {
  /**
   * Read a user's settings, or `null`.
   *
   * Returns null rather than creating, because `getOrCreate` is called on every
   * page load and writing a row per load would be a write on the hot path.
   */
  async get(userId: UserId): Promise<FocusSettings | null> {
    try {
      return await this.prisma.focusSettings.findUnique({ where: { userId } });
    } catch (error) {
      this.handleError(error, 'get');
    }
  }

  /**
   * Read settings, creating the default row on first use.
   *
   * The creation is guarded by `upsert` rather than a read-then-write so two
   * concurrent first-loads cannot both insert. `FocusSettings.userId` is unique,
   * so the loser of that race is a no-op rather than a unique-violation error.
   */
  async getOrCreate(userId: UserId): Promise<FocusSettings> {
    try {
      const existing = await this.prisma.focusSettings.findUnique({ where: { userId } });
      if (existing) return existing;
      return await this.prisma.focusSettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    } catch (error) {
      this.handleError(error, 'getOrCreate');
    }
  }

  async update(userId: UserId, data: UpsertFocusSettingsData): Promise<FocusSettings> {
    try {
      // An explicitly-typed payload. The original `abortedAt` bug was a field
      // silently dropped between a service and its repository, and the cheapest
      // guard against that class of defect is for the write target to be typed
      // against the caller's input type.
      const patch: Prisma.FocusSettingsUncheckedUpdateInput = { ...data };
      return await this.prisma.focusSettings.update({
        where: { userId },
        data: patch,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /** Presets in the user's order, archived ones excluded. */
  async listPresets(userId: UserId, includeArchived = false): Promise<FocusPreset[]> {
    try {
      return await this.prisma.focusPreset.findMany({
        where: {
          userId,
          ...(includeArchived ? {} : { isArchived: false }),
        },
        include: { category: { select: { id: true, name: true, color: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    } catch (error) {
      this.handleError(error, 'listPresets');
    }
  }

  /**
   * Seed the default presets the first time a user opens the preset list.
   *
   * Guarded on the user having *no* presets at all rather than on a flag, so a
   * user who deletes every preset does not get them silently recreated on their
   * next visit — which is the failure mode a boolean "seeded" flag produces.
   */
  async seedDefaultsIfEmpty(userId: UserId): Promise<FocusPreset[]> {
    try {
      const count = await this.prisma.focusPreset.count({ where: { userId } });
      if (count > 0) return this.listPresets(userId);

      await this.prisma.focusPreset.createMany({
        data: DEFAULT_PRESETS.map((preset, index) => ({
          userId,
          ...preset,
          sortOrder: index,
          isDefault: true,
        })),
      });
      return this.listPresets(userId);
    } catch (error) {
      this.handleError(error, 'seedDefaultsIfEmpty');
    }
  }

  async createPreset(userId: UserId, data: UpsertFocusPresetData): Promise<FocusPreset> {
    try {
      if (data.categoryId) {
        const owned = await this.prisma.category.findFirst({
          where: { id: data.categoryId, userId },
          select: { id: true },
        });
        if (!owned) {
          this.handleError(new Error(`Category ${data.categoryId} not found`), 'createPreset');
        }
      }
      // The **unchecked** form: `userId` and `categoryId` are both plain scalars
      // here rather than nested relation writes. Prisma's checked
      // `FocusPresetCreateInput` refuses a mix of the two, and using the unchecked
      // form for both keeps one code path instead of branching on whether a
      // category was supplied.
      const row: Prisma.FocusPresetUncheckedCreateInput = {
        userId,
        name: data.name,
        focusMinutes: data.focusMinutes,
        shortBreakMinutes: data.shortBreakMinutes,
        longBreakMinutes: data.longBreakMinutes,
        cyclesBeforeLongBreak: data.cyclesBeforeLongBreak,
        color: data.color ?? null,
        icon: data.icon ?? null,
        sortOrder: data.sortOrder ?? 0,
        categoryId: data.categoryId ?? null,
      };
      return await this.prisma.focusPreset.create({ data: row });
    } catch (error) {
      this.handleError(error, 'createPreset');
    }
  }

  async updatePreset(
    userId: UserId,
    presetId: string,
    data: Partial<UpsertFocusPresetData> & { isArchived?: boolean }
  ): Promise<FocusPreset> {
    try {
      const patch: Prisma.FocusPresetUncheckedUpdateInput = {
        name: data.name,
        focusMinutes: data.focusMinutes,
        shortBreakMinutes: data.shortBreakMinutes,
        longBreakMinutes: data.longBreakMinutes,
        cyclesBeforeLongBreak: data.cyclesBeforeLongBreak,
        sortOrder: data.sortOrder,
        isArchived: data.isArchived,
        color: data.color,
        icon: data.icon,
      };
      return await this.prisma.focusPreset.update({
        where: { id: presetId, userId },
        data: patch,
      });
    } catch (error) {
      this.handleError(error, 'updatePreset');
    }
  }

  /**
   * Delete a preset.
   *
   * A hard delete, not an archive: presets hold no history and no sessions
   * reference one, so there is nothing to preserve. A seeded preset can be
   * deleted like any other.
   */
  async deletePreset(userId: UserId, presetId: string): Promise<FocusPreset> {
    try {
      return await this.prisma.focusPreset.delete({ where: { id: presetId, userId } });
    } catch (error) {
      this.handleError(error, 'deletePreset');
    }
  }

  /** Per-day-type targets, as a flat map keyed by day type id. */
  async listDayTypeTargets(userId: UserId): Promise<Map<string, number>> {
    try {
      const rows = await this.prisma.focusDayTypeTarget.findMany({
        where: { userId },
        select: { dayTypeId: true, targetMinutes: true },
      });
      return new Map(rows.map((row) => [row.dayTypeId, row.targetMinutes]));
    } catch (error) {
      this.handleError(error, 'listDayTypeTargets');
    }
  }

  async setDayTypeTarget(userId: UserId, dayTypeId: string, targetMinutes: number): Promise<void> {
    try {
      const owned = await this.prisma.dayTypeDefinition.findFirst({
        where: { id: dayTypeId, userId },
        select: { id: true },
      });
      if (!owned) {
        this.handleError(new Error(`Day type ${dayTypeId} not found`), 'setDayTypeTarget');
      }
      await this.prisma.focusDayTypeTarget.upsert({
        where: { userId_dayTypeId: { userId, dayTypeId } },
        create: { userId, dayTypeId, targetMinutes },
        update: { targetMinutes },
      });
    } catch (error) {
      this.handleError(error, 'setDayTypeTarget');
    }
  }

  async deleteDayTypeTarget(userId: UserId, dayTypeId: string): Promise<void> {
    try {
      await this.prisma.focusDayTypeTarget.deleteMany({ where: { userId, dayTypeId } });
    } catch (error) {
      this.handleError(error, 'deleteDayTypeTarget');
    }
  }
}

export const focusSettingsRepository = new FocusSettingsRepository();
