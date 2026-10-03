import type { AutomationRule, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Automation Repository
 * Database operations for the AutomationRule model, including minimal
 * rule evaluation ("trigger") that can spawn tasks from action config.
 */

export interface CreateAutomationData {
  name: string;
  triggerType: string;
  triggerConfig: string;
  actionType: string;
  actionConfig: string;
  isActive?: boolean;
}

export interface AutomationQueryParams {
  isActive?: boolean;
  triggerType?: string;
  actionType?: string;
  limit?: number;
  offset?: number;
}

export interface AutomationTriggerResult {
  rule: AutomationRule;
  createdTaskId?: string;
}

export class AutomationRepository extends BaseRepository {
  /**
   * Create an automation rule for a user
   */
  async create(userId: UserId, data: CreateAutomationData): Promise<AutomationRule> {
    try {
      return await this.prisma.automationRule.create({
        data: {
          userId,
          name: data.name,
          isActive: data.isActive ?? true,
          triggerType: data.triggerType,
          triggerConfig: data.triggerConfig,
          actionType: data.actionType,
          actionConfig: data.actionConfig,
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find automation rules for a user with optional filters
   */
  async findByUserId(userId: UserId, query: AutomationQueryParams = {}): Promise<AutomationRule[]> {
    try {
      const where: Prisma.AutomationRuleWhereInput = { userId };

      if (query.isActive !== undefined) where.isActive = query.isActive;
      if (query.triggerType) where.triggerType = query.triggerType;
      if (query.actionType) where.actionType = query.actionType;

      return await this.prisma.automationRule.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Enabled rules that listen for a given trigger event.
   *
   * The evaluator's only query: it must be cheap enough to run on hot paths
   * like logging a habit. `@@index([userId, isActive])` covers the filter.
   */
  async findActiveByTriggerType(userId: UserId, triggerType: string): Promise<AutomationRule[]> {
    try {
      return await this.prisma.automationRule.findMany({
        where: { userId, isActive: true, triggerType },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findActiveByTriggerType');
    }
  }

  /**
   * Find a single automation rule owned by the user
   */
  async findById(userId: UserId, ruleId: string): Promise<AutomationRule | null> {
    try {
      return await this.prisma.automationRule.findFirst({
        where: { id: ruleId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Update an automation rule owned by the user
   */
  async update(
    userId: UserId,
    ruleId: string,
    data: Prisma.AutomationRuleUpdateInput,
  ): Promise<AutomationRule> {
    try {
      return await this.prisma.automationRule.update({
        where: { id: ruleId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete an automation rule owned by the user
   */
  async delete(userId: UserId, ruleId: string): Promise<AutomationRule> {
    try {
      return await this.prisma.automationRule.delete({
        where: { id: ruleId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Set whether an automation rule is active
   */
  async setActive(userId: UserId, ruleId: string, isActive: boolean): Promise<AutomationRule> {
    try {
      return await this.prisma.automationRule.update({
        where: { id: ruleId, userId },
        data: { isActive },
      });
    } catch (error) {
      this.handleError(error, 'setActive');
    }
  }

  /**
   * Record that a rule fired: bump the counters and stamp `lastTriggered`.
   *
   * Deliberately does **not** execute the action. Business logic belongs in
   * `AutomationService`, which owns the action implementations; this method only
   * persists execution bookkeeping. Keeping them apart is what stopped
   * 4 of the 5 `actionType` values from being silently ignored — the old
   * combined `trigger()` handled only `CREATE_TASK` and quietly recorded a
   * "success" for every other type.
   */
  async markTriggered(userId: UserId, ruleId: string): Promise<AutomationRule> {
    try {
      const rule = await this.findById(userId, ruleId);
      if (!rule) {
        this.handleError(new Error('Automation rule not found'), 'markTriggered');
      }

      return await this.prisma.automationRule.update({
        where: { id: ruleId },
        data: {
          timesTriggered: { increment: 1 },
          lastTriggered: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'markTriggered');
    }
  }
}
