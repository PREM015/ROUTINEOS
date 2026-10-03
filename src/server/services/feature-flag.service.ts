import { FeatureFlagRepository } from '@/server/repositories/feature-flag.repository';
import { assertAdmin } from '@/server/admin-guard';
import { evaluateFlag, evaluateFlags } from '@/lib/feature-flags/checker';
import { ConflictError, NotFoundError } from '@/lib/errors/app-error';
import type { FeatureFlag, Role } from '@/generated/prisma';

/**
 * Feature Flag Service
 *
 * Owns flag resolution and the admin gate on flag management (ERROR.md §1).
 *
 * The admin check is the substantive part. It was an inline
 * `if (user?.role !== 'ADMIN') return 403` duplicated in both handlers of
 * `admin/feature-flags`, and the *third* flag-writing path — `POST
 * /api/feature-flags` letting a user toggle their own flag — has no admin check
 * at all, correctly, because it is not an admin operation. Keeping "who may
 * manage flags globally" in one place is what makes the difference between those
 * two visible.
 */
export class FeatureFlagService {
  private readonly featureFlagRepository: FeatureFlagRepository;

  constructor(
    featureFlagRepository: FeatureFlagRepository = new FeatureFlagRepository()
  ) {
    this.featureFlagRepository = featureFlagRepository;
  }

  /** Every flag, for the admin list. */
  async listAll(): Promise<FeatureFlag[]> {
    return this.featureFlagRepository.findAll();
  }

  /**
   * Every flag with the caller's *effective* availability.
   *
   * This used to be a loop over `checkFlag(key)`, and since `checkFlag` is one
   * `findUnique` per call it re-read every row the list had just fetched — N+1
   * queries to annotate rows already in hand. `evaluateFlags` runs the same
   * decision logic over the rows directly.
   */
  async listForUser(userId: string, role?: Role) {
    const flags = await this.featureFlagRepository.findAll();
    const decisions = evaluateFlags(flags, { userId, role });

    return flags.map((flag, index) => {
      const decision = decisions[index];
      return {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        isEnabled: flag.isEnabled,
        rolloutPercent: flag.rolloutPercent,
        enabled: decision?.isEnabled ?? false,
        reason: decision?.reason ?? 'missing',
      };
    });
  }

  /** Every flag, admin only. */
  async listAllForAdmin(userId: string): Promise<FeatureFlag[]> {
    await assertAdmin(userId);
    return this.featureFlagRepository.findAll();
  }

  /**
   * A single flag by key.
   *
   * `NotFoundError` when the key is not registered — distinct from "registered
   * but off", which returns the flag with `isEnabled: false`.
   */
  async getByKey(key: string): Promise<FeatureFlag> {
    const flag = await this.featureFlagRepository.findByKey(key);
    if (!flag) {
      throw new NotFoundError('Feature flag');
    }
    return flag;
  }

  /** Whether a flag is on for this user (global default, or their override). */
  async isEnabledForUser(key: string, userId: string): Promise<boolean> {
    const flags = await this.featureFlagRepository.listByUserId(userId);
    const flag = flags.find((item) => item.key === key);
    if (!flag) {
      throw new NotFoundError('Feature flag');
    }
    return flag.isEnabled;
  }

  /**
   * Whether one flag is on for this user, with the reason.
   *
   * Single query. This endpoint previously did `findByKey` and then called
   * `checkFlag`, which issued a *second* `findUnique` for the row it had just
   * read — so the existence check and the evaluation were looking at two
   * separate reads that could disagree if the flag changed in between.
   */
  async checkForUser(key: string, userId: string, role?: Role) {
    const flag = await this.getByKey(key);
    const decision = evaluateFlag(flag, { userId, role });

    return { key: flag.key, enabled: decision.isEnabled, reason: decision.reason };
  }

  /**
   * Set a flag for the current user only.
   *
   * This is a per-user preference, not global configuration, so it is
   * intentionally available to any signed-in user — unlike `listAllForAdmin` and
   * `create`.
   */
  async setForUser(
    key: string,
    userId: string,
    enabled: boolean
  ): Promise<FeatureFlag> {
    // Existence first, so toggling an unregistered key is a 404 rather than
    // silently creating a row.
    await this.getByKey(key);
    return this.featureFlagRepository.setForUser(key, userId, enabled);
  }

  /** Create a flag. Admin only. */
  async create(userId: string, data: Parameters<FeatureFlagRepository['create']>[0]) {
    await assertAdmin(userId);
    return this.featureFlagRepository.create(data);
  }

  /**
   * Update a flag's global definition. Admin only.
   *
   * `ConflictError` when the key is already registered, which the route returned
   * as a 409.
   */
  async update(
    userId: string,
    key: string,
    data: Partial<Parameters<FeatureFlagRepository['update']>[1]>
  ): Promise<FeatureFlag> {
    await assertAdmin(userId);
    const existing = await this.getByKey(key);
    return this.featureFlagRepository.update(existing.key, data);
  }

  /** Create or replace a flag. Admin only. */
  async upsert(
    userId: string,
    data: Parameters<FeatureFlagRepository['upsert']>[0]
  ): Promise<FeatureFlag> {
    await assertAdmin(userId);
    return this.featureFlagRepository.upsert(data);
  }

  /** Rejects a duplicate key, so `create` does not silently overwrite. */
  async createStrict(
    userId: string,
    data: Parameters<FeatureFlagRepository['create']>[0]
  ): Promise<FeatureFlag> {
    await assertAdmin(userId);
    const existing = await this.featureFlagRepository.findByKey(data.key);
    if (existing) {
      throw new ConflictError('Feature flag with this key already exists');
    }
    return this.featureFlagRepository.create(data);
  }
}

export const featureFlagService = new FeatureFlagService();
