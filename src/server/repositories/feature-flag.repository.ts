import type { FeatureFlag } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Feature Flag Repository
 * CRUD operations for feature flag rows
 */

export interface FeatureFlagInput {
  key: string;
  name: string;
  description?: string;
  isEnabled?: boolean;
  rolloutPercent?: number;
  enabledForUsers?: string[];
  enabledForRoles?: string[];
}

function serializeArray(value: string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return JSON.stringify(value);
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export class FeatureFlagRepository extends BaseRepository {
  async findAll(): Promise<FeatureFlag[]> {
    try {
      return await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  async findByKey(key: string): Promise<FeatureFlag | null> {
    try {
      return await this.prisma.featureFlag.findUnique({ where: { key } });
    } catch (error) {
      this.handleError(error, 'findByKey');
    }
  }

  async listByUserId(_userId: string): Promise<FeatureFlag[]> {
    // Feature flags are global; caller evaluates per-user access via the checker
    return this.findAll();
  }

  async create(data: FeatureFlagInput): Promise<FeatureFlag> {
    try {
      return await this.prisma.featureFlag.create({
        data: {
          key: data.key,
          name: data.name,
          description: data.description,
          isEnabled: data.isEnabled,
          rolloutPercent: data.rolloutPercent,
          enabledForUsers: serializeArray(data.enabledForUsers),
          enabledForRoles: serializeArray(data.enabledForRoles),
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  async update(key: string, data: Partial<FeatureFlagInput>): Promise<FeatureFlag> {
    try {
      return await this.prisma.featureFlag.update({
        where: { key },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
          ...(data.rolloutPercent !== undefined && { rolloutPercent: data.rolloutPercent }),
          ...(data.enabledForUsers !== undefined && {
            enabledForUsers: serializeArray(data.enabledForUsers),
          }),
          ...(data.enabledForRoles !== undefined && {
            enabledForRoles: serializeArray(data.enabledForRoles),
          }),
        },
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  async upsert(data: FeatureFlagInput): Promise<FeatureFlag> {
    try {
      const existing = await this.prisma.featureFlag.findUnique({ where: { key: data.key } });
      if (existing) {
        return this.update(data.key, data);
      }
      return this.create(data);
    } catch (error) {
      this.handleError(error, 'upsert');
    }
  }

  async setForUser(key: string, userId: string, enabled: boolean): Promise<FeatureFlag> {
    try {
      const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
      if (!flag) {
        this.handleError(new Error(`Feature flag "${key}" not found`), 'setForUser');
      }
      const currentUsers = parseStringArray(flag?.enabledForUsers);
      const nextUsers = enabled
        ? currentUsers.includes(userId)
          ? currentUsers
          : [...currentUsers, userId]
        : currentUsers.filter((id) => id !== userId);

      return await this.prisma.featureFlag.update({
        where: { key },
        data: { enabledForUsers: JSON.stringify(nextUsers) },
      });
    } catch (error) {
      this.handleError(error, 'setForUser');
    }
  }
}