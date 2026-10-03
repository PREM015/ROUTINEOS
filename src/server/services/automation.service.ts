import { AutomationRepository } from '@/server/repositories/automation.repository';
import { formatInTimeZone } from 'date-fns-tz';
import { TaskPriority } from '@/generated/prisma';
import type { AutomationRule, Prisma } from '@/generated/prisma';
import {
  automationSchema,
  updateAutomationSchema,
  type AutomationQueryParams,
} from '@/schemas/automation.schema';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import type { UserId } from '@/types/ids';

/**
 * Automation Service
 * Evaluates automation rules against domain events and executes their actions.
 *
 * The repository can already record a firing (`markTriggered`) and the CRUD
 * routes can create and enable rules, but nothing ever evaluated them — so
 * `isActive: true` was decorative. This service is that missing link.
 *
 * ## Action and trigger coverage
 *
 * Every `actionType` and every `triggerType` the API accepts is implemented
 * here. That matters: an earlier version recorded a successful firing for
 * action types it did not implement, so rules appeared to work while doing
 * nothing. `LOCATION_ENTERED` was removed from the trigger enum instead, since
 * the `Location` table has no reader, writer, or client integration at all and
 * cannot be evaluated honestly.
 *
 * ## Import cycle
 *
 * The action implementations are loaded with **dynamic `import()`** inside
 * `executeAction`, not with top-level imports. `habit.service` and
 * `scoring.service` both call `handleEvent` on this service, so eagerly
 * importing them here closes a cycle
 * (`automation -> habit -> automation`). `tsc` does not detect this; it only
 * surfaces at runtime as
 * `ReferenceError: Cannot access 'HabitService' before initialization` during
 * `next build` page-data collection. Keep these imports lazy.
 */

/** Events a rule can subscribe to. */
export type AutomationEvent =
  /** A habit was logged as COMPLETED. */
  | { type: 'HABIT_COMPLETED'; habitId: string; date: string }
  /** A clock time was reached, for a rule with a `time` in its trigger config. */
  | { type: 'TIME_REACHED'; at: string }
  /** A day's total score crossed a threshold. */
  | { type: 'SCORE_THRESHOLD'; date: string; totalScore: number };

export interface AutomationOutcome {
  ruleId: string;
  ruleName: string;
  actionType: string;
  fired: boolean;
  /** Id of the entity the action created or changed, when there was one. */
  entityId?: string;
  error?: string;
}

export interface AutomationRunResult {
  matched: number;
  fired: number;
  outcomes: AutomationOutcome[];
}

/** Guard an untrusted config string against the real `TaskPriority` enum. */
function isTaskPriority(value: string | undefined): value is TaskPriority {
  return value !== undefined && Object.values(TaskPriority).includes(value as TaskPriority);
}

/** Parse a JSON config column, tolerating anything that is not an object. */
function parseConfig(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to the empty object
  }
  return {};
}

function readString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(config: Record<string, unknown>, key: string): number | undefined {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** `"09:00"` -> minutes since midnight, or undefined if unparseable. */
function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === undefined || minutes === undefined) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export class AutomationService {
  private automationRepository: AutomationRepository;
  constructor() {
    this.automationRepository = new AutomationRepository();
  }

  // ---------------------------------------------------------------------
  // CRUD
  //
  // Validation and the ownership check live here so the routes stay thin. The
  // schemas are shared with the routes via `src/schemas/automation.schema`, so
  // the two cannot disagree about what a valid rule is.
  // ---------------------------------------------------------------------

  async list(userId: UserId, query: AutomationQueryParams = {}): Promise<AutomationRule[]> {
    return this.automationRepository.findByUserId(userId, query);
  }

  async get(userId: UserId, ruleId: string): Promise<AutomationRule | null> {
    return this.automationRepository.findById(userId, ruleId);
  }

  async create(userId: UserId, input: unknown): Promise<AutomationRule> {
    const parsed = automationSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid automation rule');
    }
    // The schema carries configs as objects (`Record<string, unknown>`) because
    // that is what a client sends; the columns are JSON strings. Serialising
    // here keeps that translation out of the route and out of the repository.
    return this.automationRepository.create(userId, {
      name: parsed.data.name,
      triggerType: parsed.data.triggerType,
      triggerConfig: JSON.stringify(parsed.data.triggerConfig ?? {}),
      actionType: parsed.data.actionType,
      actionConfig: JSON.stringify(parsed.data.actionConfig ?? {}),
      isActive: parsed.data.isActive,
    });
  }

  async update(userId: UserId, ruleId: string, input: unknown): Promise<AutomationRule> {
    const parsed = updateAutomationSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid automation rule');
    }
    if (!(await this.automationRepository.findById(userId, ruleId))) {
      throw new NotFoundError('Automation rule not found');
    }
    const data: Prisma.AutomationRuleUpdateInput = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.triggerType !== undefined) data.triggerType = parsed.data.triggerType;
    if (parsed.data.triggerConfig !== undefined) {
      data.triggerConfig = JSON.stringify(parsed.data.triggerConfig);
    }
    if (parsed.data.actionType !== undefined) data.actionType = parsed.data.actionType;
    if (parsed.data.actionConfig !== undefined) {
      data.actionConfig = JSON.stringify(parsed.data.actionConfig);
    }
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    return this.automationRepository.update(userId, ruleId, data);
  }

  async delete(userId: UserId, ruleId: string): Promise<void> {
    if (!(await this.automationRepository.findById(userId, ruleId))) {
      throw new NotFoundError('Automation rule not found');
    }
    await this.automationRepository.delete(userId, ruleId);
  }

  /** Enable or disable a rule. Idempotent. */
  async setActive(userId: UserId, ruleId: string, isActive: boolean): Promise<AutomationRule> {
    const existing = await this.automationRepository.findById(userId, ruleId);
    if (!existing) {
      throw new NotFoundError('Automation rule not found');
    }
    if (existing.isActive === isActive) {
      return existing;
    }
    return this.automationRepository.setActive(userId, ruleId, isActive);
  }

  /**
   * Fire every enabled rule that subscribes to this event.
   *
   * Never throws: automation is a side effect of the caller's real work (a
   * habit log must not fail because an automation did), so failures are reported
   * per-rule in the result and logged.
   */
  async handleEvent(userId: UserId, event: AutomationEvent): Promise<AutomationRunResult> {
    const result: AutomationRunResult = { matched: 0, fired: 0, outcomes: [] };

    let rules: AutomationRule[];
    try {
      rules = await this.automationRepository.findActiveByTriggerType(userId, event.type);
    } catch (error) {
      console.error('Failed to load automation rules', error);
      return result;
    }

    for (const rule of rules) {
      if (!this.triggerMatches(rule, event)) continue;

      result.matched += 1;
      try {
        const entityId = await this.executeAction(userId, rule);
        // Counters are only bumped once the action actually succeeded, so
        // `timesTriggered` reflects real work done.
        await this.automationRepository.markTriggered(userId, rule.id);
        result.fired += 1;
        result.outcomes.push({
          ruleId: rule.id,
          ruleName: rule.name,
          actionType: rule.actionType,
          fired: true,
          entityId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Automation failed';
        console.error(`Automation rule ${rule.id} (${rule.actionType}) failed:`, error);
        result.outcomes.push({
          ruleId: rule.id,
          ruleName: rule.name,
          actionType: rule.actionType,
          fired: false,
          error: message,
        });
      }
    }

    return result;
  }

  /**
   * Does this rule's trigger config actually match the event?
   *
   * The event type has already been matched by the query, so this only applies
   * the narrower conditions a rule can express. An unrecognised or empty config
   * matches, so a rule created before a condition existed still fires.
   */
  private triggerMatches(rule: AutomationRule, event: AutomationEvent): boolean {
    const config = parseConfig(rule.triggerConfig);

    switch (event.type) {
      case 'HABIT_COMPLETED': {
        if (typeof config.habitId === 'string' && config.habitId !== event.habitId) {
          return false;
        }
        if (Array.isArray(config.habitIds)) {
          const ids = config.habitIds.filter((id): id is string => typeof id === 'string');
          if (ids.length > 0 && !ids.includes(event.habitId)) return false;
        }
        if (typeof config.date === 'string' && config.date !== event.date) {
          return false;
        }
        return true;
      }

      case 'TIME_REACHED': {
        // A rule with no time is not a TIME_REACHED rule; do not fire it hourly.
        const time = readString(config, 'time');
        if (!time) return false;
        const target = parseHhMm(time);
        const now = parseHhMm(event.at);
        if (target === null || now === null) return false;
        // Fires once per matching minute.
        return target === now;
      }

      case 'SCORE_THRESHOLD': {
        const threshold = readNumber(config, 'threshold');
        if (threshold === undefined) return false;
        if (typeof config.date === 'string' && config.date !== event.date) {
          return false;
        }
        return event.totalScore >= threshold;
      }
    }
  }

  /**
   * Run the rule's action.
   *
   * Throws on an unusable configuration rather than silently doing nothing, so
   * a misconfigured rule is visible as a failure rather than a false success.
   */
  private async executeAction(userId: UserId, rule: AutomationRule): Promise<string | undefined> {
    const config = parseConfig(rule.actionConfig);

    switch (rule.actionType) {
      case 'CREATE_TASK': {
        const title = readString(config, 'title');
        if (!title) throw new Error('CREATE_TASK requires a non-empty "title"');
        const dueDate = readString(config, 'dueDate');
        const { TaskService } = await import('@/server/services/task.service');
        const task = await new TaskService().createTask(userId, {
          title,
          description: readString(config, 'description'),
          goalId: readString(config, 'goalId'),
          ...(isTaskPriority(readString(config, 'priority'))
            ? { priority: readString(config, 'priority') as TaskPriority }
            : {}),
          ...(dueDate && !Number.isNaN(new Date(dueDate).getTime())
            ? { dueDate: new Date(dueDate) }
            : {}),
        });
        return task.id;
      }

      case 'CREATE_HABIT': {
        const name = readString(config, 'name');
        if (!name) throw new Error('CREATE_HABIT requires a non-empty "name"');
        const tier = readString(config, 'tier');
        const frequencyType = readString(config, 'frequencyType');
        if (!tier) throw new Error('CREATE_HABIT requires a "tier"');
        if (!frequencyType) throw new Error('CREATE_HABIT requires a "frequencyType"');
        const { HabitService } = await import('@/server/services/habit.service');
        const habit = await new HabitService().createHabit(userId, {
          name,
          description: readString(config, 'description'),
          tier: tier as never,
          frequencyType: frequencyType as never,
          frequencyValue: readString(config, 'frequencyValue'),
          points: readNumber(config, 'points'),
        });
        return habit.id;
      }

      case 'SEND_NOTIFICATION': {
        const title = readString(config, 'title');
        if (!title) throw new Error('SEND_NOTIFICATION requires a non-empty "title"');
        const created = await (
          await import('@/server/services/notification.service')
        ).notificationService.createNotification(userId, {
          type: 'AUTOMATION',
          title,
          body: readString(config, 'body'),
          actionUrl: readString(config, 'actionUrl'),
        });
        return created.id;
      }

      case 'UPDATE_GOAL': {
        const goalId = readString(config, 'goalId');
        if (!goalId) throw new Error('UPDATE_GOAL requires a "goalId"');
        const status = readString(config, 'status');
        const title = readString(config, 'title');
        if (!status && !title) {
          throw new Error('UPDATE_GOAL requires at least one of "status" or "title"');
        }
        const { GoalService } = await import('@/server/services/goal.service');
        await new GoalService().updateGoal(userId, goalId, {
          ...(status ? { status: status as never } : {}),
          ...(title ? { title } : {}),
        });
        return goalId;
      }

      case 'DECREMENT': {
        const goalId = readString(config, 'goalId');
        if (!goalId) throw new Error('DECREMENT requires a "goalId"');
        const amount = readNumber(config, 'amount') ?? 1;
        // `updateProgress` applies `value` as a delta, so a negative delta
        // is the decrement. Abs guards against a config that would otherwise
        // *increase* the goal.
        const { GoalService } = await import('@/server/services/goal.service');
        await new GoalService().updateProgress(userId, goalId, -Math.abs(amount));
        return goalId;
      }

      default: {
        // `actionType` is a plain String column, not a Prisma enum, so the
        // compiler cannot enforce exhaustiveness here. This branch is
        // deliberately loud: a row with an unknown action (hand-edited, or
        // added to the schema without implementing it) must fail visibly
        // rather than increment `timesTriggered` and do nothing.
        throw new Error(`Unsupported action type: ${rule.actionType}`);
      }
    }
  }
}

export const automationService = new AutomationService();

/**
 * Convenience wrapper for the `TIME_REACHED` trigger, which needs the caller's
 * timezone to decide which "HH:MM" it is.
 */
export async function runTimeReachedAutomations(
  userId: UserId,
  timezone: string,
  now: Date = new Date(),
): Promise<AutomationRunResult> {
  return automationService.handleEvent(userId, {
    type: 'TIME_REACHED',
    at: formatInTimeZone(now, timezone, 'HH:mm'),
  });
}
