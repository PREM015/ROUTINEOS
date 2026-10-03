import { TemplateRepository } from '@/server/repositories/template.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import type { GoalType, HabitFrequencyType, HabitTier } from '@/generated/prisma';
import { loadDefaultTemplateById, toTemplateCreateInput } from '@/lib/templates/loader';
import { contentToRoutineDraft } from '@/lib/templates/converter';
import { NotFoundError } from '@/lib/errors/app-error';
import type {
  createTemplateSchema,
  updateTemplateSchema,
} from '@/schemas/template.schema';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';

type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

/**
 * Add a parsed view of `content` to a template row.
 *
 * The client gets both the raw document and the structured form. A parse failure
 * yields `null` rather than throwing: a template written by an older version with
 * non-JSON content is still perfectly readable, it just has no structured
 * preview.
 */
function withParsedContent<T extends { content: string }>(template: T) {
  let parsedContent: unknown = null;
  try {
    parsedContent = JSON.parse(template.content);
  } catch {
    parsedContent = null;
  }
  return { ...template, parsedContent };
}

/**
 * Template Service
 *
 * Owns template application: resolving a template (built-in or user-owned),
 * materialising routine-family templates as routine templates, and building
 * the placeholder structures returned for habit/goal sets.
 *
 * All of this previously lived in `app/api/templates/use/route.ts`.
 */

/** Template types that materialise into a real routine template. */
const ROUTINE_TYPES = [
  'ROUTINE',
  'MORNING_ROUTINE',
  'EVENING_ROUTINE',
  'WORKOUT',
  'STUDY_SESSION',
] as const;

export class TemplateService {
  private templateRepository: TemplateRepository;
  /**
   * Added for real `GOAL_SET` / `HABIT_SET` materialisation.
   *
   * Deliberately repositories rather than a `PrismaClient` instance: the project's
   * layering rule (`FILE.MD`) is that repositories are the *only* DB access layer,
   * and reaching past them would skip the shared `handleError` wrapping every
   * other write in this service relies on.
   */
  private goalRepository: GoalRepository;
  private habitRepository: HabitRepository;

  constructor() {
    this.templateRepository = new TemplateRepository();
    this.goalRepository = new GoalRepository();
    this.habitRepository = new HabitRepository();
  }

  /**
   * Templates the user can see: their own plus public ones.
   */
  async listForUser(
    userId: string,
    query: Parameters<TemplateRepository['findAll']>[1] = {}
  ) {
    return this.templateRepository.findAll(userId, query);
  }

  /**
   * Public template catalogue, paginated.
   *
   * Unauthenticated by design — it is the browsing surface — so the repository
   * call is not scoped to a user and no ownership check applies.
   */
  async listPublic(limit: number, offset: number) {
    return this.templateRepository.listPublic(limit, offset);
  }

  /** Create a template owned by the user. */
  async create(userId: string, input: CreateTemplateInput) {
    return this.templateRepository.createTemplate(userId, input);
  }

  /**
   * One template owned by the user, with its content parsed for the client, or
   * `NotFoundError`.
   *
   * The response projection lives here because it is part of the contract: the
   * client receives both the raw `content` string and a `parsedContent` object.
   * A failed parse yields `null` rather than throwing, so a template stored by an
   * older writer with non-JSON content is still readable — it just has no
   * structured preview.
   */
  async getForUser(userId: string, templateId: string) {
    const template = await this.templateRepository.findById(userId, templateId);
    if (!template) {
      throw new NotFoundError('Template');
    }
    return withParsedContent(template);
  }

  /**
   * Update a template the user owns.
   *
   * Ownership is checked before the write, and only fields actually present in
   * the body are applied so an absent key is not written as `undefined`.
   *
   * `content` is passed through untouched: `createTemplateSchema` types it as a
   * **string** (the raw template document), and the repository takes it as-is.
   * Only `tags` is serialised, because that column is a JSON array.
   */
  async update(userId: string, templateId: string, input: UpdateTemplateInput) {
    await this.getForUser(userId, templateId);

    const updated = await this.templateRepository.update(userId, templateId, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
      ...(input.isFeatured !== undefined && { isFeatured: input.isFeatured }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.tags !== undefined && { tags: JSON.stringify(input.tags) }),
    });

    // Same projection as `getForUser`, so a client that PATCHes then re-reads
    // gets an identical shape and does not have to know which came from where.
    return withParsedContent(updated);
  }

  /** Delete a template the user owns. */
  async delete(userId: string, templateId: string) {
    await this.getForUser(userId, templateId);
    return this.templateRepository.delete(userId, templateId);
  }

  /**
   * Apply a template.
   *
   * A built-in template is first copied into the user's own template rows so the
   * applied artefact is owned by (and editable for) them.
   *
   * @throws when the template id matches neither a built-in nor an owned template.
   */
  async applyTemplate(userId: string, templateId: string) {
    const defaultTemplate = loadDefaultTemplateById(templateId);
    let template: {
      id: string;
      type: string;
      name: string;
      content: string;
    } | null = null;

    if (defaultTemplate) {
      const createInput = toTemplateCreateInput(defaultTemplate);
      const persisted = await this.templateRepository.createTemplate(userId, {
        type: createInput.type,
        name: createInput.name,
        description: createInput.description ?? undefined,
        category: createInput.category,
        isPublic: false,
        isFeatured: createInput.isFeatured,
        content: createInput.content,
        tags: createInput.tags,
      });
      template = {
        id: persisted.id,
        type: persisted.type,
        name: persisted.name,
        content: persisted.content,
      };
    } else {
      const found = await this.templateRepository.findById(userId, templateId);
      if (found) {
        template = {
          id: found.id,
          type: found.type,
          name: found.name,
          content: found.content,
        };
      }
    }

    if (!template) {
      throw new Error('Template not found');
    }

    await this.templateRepository.incrementUseCount(template.id);

    if ((ROUTINE_TYPES as readonly string[]).includes(template.type)) {
      const draft = contentToRoutineDraft(template.content);
      if (draft) {
        const routine = await this.templateRepository.createRoutineFromTemplate(
          userId,
          template.id,
          { name: draft.name }
        );
        return {
          templateId: template.id,
          type: template.type,
          applied: 'ROUTINE' as const,
          routineTemplateId: routine.id,
        };
      }
    }

    /**
     * Real creation for `GOAL_SET` / `HABIT_SET`.
     *
     * This branch used to return a `createdStructures` array of freshly
     * generated UUIDs with `status: 'PLACEHOLDER'` — which reads as success in
     * the UI while writing no rows at all. Applying a template did nothing.
     *
     * The 90-day discipline challenge is the first default template that carries
     * `goals` and `habits`, so this is where they are materialised:
     *   * a parent goal (the 90-day outcome) with `durationDays` setting its
     *     window, and the child goals attached via `parentGoalId` — the schema
     *     already has that self-relation;
     *   * one habit per definition, with the challenge's frequency preserved, so
     *     a weekly workout stays a *weekly* target instead of becoming a daily
     *     habit where a rest day would read as a failure.
     *
     * Idempotent: re-applying updates nothing and returns `created: false`
     * rather than duplicating a user's habits.
     */
    if (template.type === 'GOAL_SET' || template.type === 'HABIT_SET') {
      return await this.materialiseSet(userId, template);
    }

    return {
      templateId: template.id,
      type: template.type,
      applied: 'CUSTOM' as const,
      createdStructures: [
        {
          id: randomUUID(),
          type: template.type,
          name: template.name,
          sourceTemplateId: template.id,
          status: 'PLACEHOLDER',
        },
      ],
    };
  }

  /**
   * Create (or detect) the goals and habits a set template defines.
   *
   * Kept separate from {@link applyTemplate} so the transaction boundary and the
   * parent-then-child ordering are explicit: child goals carry `parentGoalId`, so
   * the parent has to exist first.
   */
  private async materialiseSet(
    userId: string,
    template: { id: string; type: string; name: string; content: string }
  ) {
    const definition = this.parseSetDefinition(template.content);
    if (!definition) {
      return {
        templateId: template.id,
        type: template.type,
        applied: template.type as 'GOAL_SET' | 'HABIT_SET',
        created: false,
        goalsCreated: 0,
        habitsCreated: 0,
        reason: 'Template carries no goals or habits to create',
      };
    }

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + (definition.durationDays ?? 90));

    /**
     * De-duplication is by **title / name**, not by the definition key.
     *
     * The `key` is a stable slug inside the template, not a database identifier —
     * there is no column to store it in without a migration, and adding one for
     * this would be out of proportion. Titles are unique enough here: applying the
     * same challenge twice should be a no-op, and a user who genuinely wants two
     * goals with an identical title is not a case worth optimising for.
     */
    const existingGoals = await this.goalRepository.findAll(userId, {});
    const existingGoalTitles = new Set(existingGoals.map((g) => g.title));
    const existingHabits = await this.habitRepository.findAll(userId, {
      includeArchived: true,
    });
    const existingHabitNames = new Set(existingHabits.map((h) => h.name));

    let parentGoalId: string | null = null;
    let goalsCreated = 0;

    if (definition.parentGoal && !existingGoalTitles.has(definition.parentGoal.title)) {
      const parent = await this.goalRepository.create({
        user: { connect: { id: userId } },
        title: definition.parentGoal.title,
        description: definition.parentGoal.description,
        type: definition.parentGoal.type as GoalType,
        targetValue: definition.parentGoal.targetValue,
        currentValue: 0,
        unit: definition.parentGoal.unit,
        startDate: now,
        endDate: end,
      });
      parentGoalId = parent.id;
      existingGoalTitles.add(parent.title);
      goalsCreated += 1;
    }

    for (const goal of definition.goals) {
      if (existingGoalTitles.has(goal.title)) continue;
      await this.goalRepository.create({
        user: { connect: { id: userId } },
        // `parentGoal` is the relation name; the scalar id is `parentGoalId`.
        // A checked create input will not take both.
        ...(parentGoalId ? { parentGoal: { connect: { id: parentGoalId } } } : {}),
        title: goal.title,
        description: goal.description,
        type: goal.type as GoalType,
        targetValue: goal.targetValue,
        currentValue: 0,
        unit: goal.unit,
        startDate: now,
        endDate: end,
      });
      existingGoalTitles.add(goal.title);
      goalsCreated += 1;
    }

    let habitsCreated = 0;
    for (const habit of definition.habits) {
      if (existingHabitNames.has(habit.name)) continue;
      await this.habitRepository.create({
        user: { connect: { id: userId } },
        name: habit.name,
        description: habit.description,
        tier: habit.tier as HabitTier,
        frequencyType: habit.frequencyType as HabitFrequencyType,
        frequencyValue: habit.frequencyValue,
        targetCount: habit.targetCount,
        color: habit.color,
        icon: habit.icon,
        startDate: now,
        endDate: end,
        appliesEveryDay: true,
      });
      existingHabitNames.add(habit.name);
      habitsCreated += 1;
    }

    return {
      templateId: template.id,
      type: template.type,
      applied: template.type as 'GOAL_SET' | 'HABIT_SET',
      created: goalsCreated > 0 || habitsCreated > 0,
      goalsCreated,
      habitsCreated,
      parentGoalId,
      alreadyApplied: goalsCreated === 0 && habitsCreated === 0,
    };
  }

  /**
   * Pull `goals` / `habits` / `parentGoal` out of a template's JSON `content`.
   *
   * Defensive on purpose: `Template.content` is a free-text JSON column, and the
   * pre-existing default templates legitimately have no such keys. A malformed or
   * absent payload must degrade to "nothing to create", never to a thrown error
   * mid-apply.
   */
  private parseSetDefinition(content: string): {
    goals: Array<{
      key: string;
      title: string;
      description: string;
      type: string;
      targetValue: number;
      unit: string;
      category: string;
      icon: string;
      drivenByHabitKeys: readonly string[];
    }>;
    habits: Array<{
      key: string;
      name: string;
      description: string;
      category: string;
      tier: string;
      frequencyType: string;
      frequencyValue: string | null;
      targetCount: number | null;
      color: string;
      icon: string;
    }>;
    parentGoal?: {
      key: string;
      title: string;
      description: string;
      type: string;
      targetValue: number;
      unit: string;
      category: string;
      icon: string;
    };
    durationDays?: number;
  } | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const root = parsed as Record<string, unknown>;
    // `toTemplateCreateInput` stores the whole template object as `content`, so
    // the goals may sit at the top level or nested under `content`.
    const nested =
      root.content && typeof root.content === 'object'
        ? (root.content as Record<string, unknown>)
        : root;

    const goals = Array.isArray(nested.goals) ? nested.goals : [];
    const habits = Array.isArray(nested.habits) ? nested.habits : [];
    const parentGoal =
      nested.parentGoal && typeof nested.parentGoal === 'object'
        ? (nested.parentGoal as Record<string, unknown>)
        : undefined;
    const durationDays = typeof nested.durationDays === 'number' ? nested.durationDays : undefined;

    if (goals.length === 0 && habits.length === 0) return null;

    return {
      goals: goals as never,
      habits: habits as never,
      parentGoal: parentGoal as never,
      durationDays,
    };
  }
}

export const templateService = new TemplateService();
