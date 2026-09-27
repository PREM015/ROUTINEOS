import { TemplateRepository } from '@/server/repositories/template.repository';
import { loadDefaultTemplateById, toTemplateCreateInput } from '@/lib/templates/loader';
import { contentToRoutineDraft } from '@/lib/templates/converter';
import { randomUUID } from 'node:crypto';

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

  constructor() {
    this.templateRepository = new TemplateRepository();
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

    return {
      templateId: template.id,
      type: template.type,
      applied:
        template.type === 'HABIT_SET' || template.type === 'GOAL_SET'
          ? template.type
          : ('CUSTOM' as const),
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
}

export const templateService = new TemplateService();
