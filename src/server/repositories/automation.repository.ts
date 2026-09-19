import type { AutomationRule, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

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
  async create(userId: string, data: CreateAutomationData): Promise<AutomationRule> {
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
  async findByUserId(userId: string, query: AutomationQueryParams = {}): Promise<AutomationRule[]> {
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
   * Find a single automation rule owned by the user
   */
  async findById(userId: string, ruleId: string): Promise<AutomationRule | null> {
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
    userId: string,
    ruleId: string,
    data: Prisma.AutomationRuleUpdateInput
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
  async delete(userId: string, ruleId: string): Promise<AutomationRule> {
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
  async setActive(userId: string, ruleId: string, isActive: boolean): Promise<AutomationRule> {
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
   * Execute an automation rule (minimal evaluation).
   * Always records the trigger; a CREATE_TASK action also spawns a task.
   */
  async trigger(userId: string, ruleId: string): Promise<AutomationTriggerResult> {
    try {
      const rule = await this.findById(userId, ruleId);
      if (!rule) {
        this.handleError(new Error('Automation rule not found'), 'trigger');
      }

      let createdTaskId: string | undefined;
      if (rule.actionType === 'CREATE_TASK') {
        const config = this.parseConfig(rule.actionConfig);
        const title = config.title;
        if (typeof title === 'string' && title.trim().length > 0) {
          const description = config.description;
          const task = await this.prisma.task.create({
            data: {
              title: title.trim(),
              description: typeof description === 'string' ? description : undefined,
              user: { connect: { id: userId } },
            },
          });
          createdTaskId = task.id;
        }
      }

      const updated = await this.prisma.automationRule.update({
        where: { id: ruleId },
        data: {
          timesTriggered: { increment: 1 },
          lastTriggered: new Date(),
        },
      });

      return { rule: updated, createdTaskId };
    } catch (error) {
      this.handleError(error, 'trigger');
    }
  }

  private parseConfig(value: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to empty config when stored JSON is invalid.
    }
    return {};
  }
}