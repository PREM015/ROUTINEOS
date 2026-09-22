import { auth } from '@/lib/auth';
import { TemplateRepository } from '@/server/repositories/template.repository';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { loadDefaultTemplateById, toTemplateCreateInput } from '@/lib/templates/loader';
import { contentToRoutineDraft } from '@/lib/templates/converter';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Template Use Route
 * POST /api/templates/use – apply a template (build a routine or create a
 *                           placeholder structure for habit/goal sets)
 */

const templateApplySchema = z.object({
  templateId: z.string().min(1, 'templateId is required'),
});

const ROUTINE_TYPES = ['ROUTINE', 'MORNING_ROUTINE', 'EVENING_ROUTINE', 'WORKOUT', 'STUDY_SESSION'] as const;

/**
 * POST /api/templates/use
 * Apply a template: ROUTINE-family templates materialize as a routine template
 * (and increment usage); HABIT_SET/GOAL_SET return placeholder structures with
 * generated ids.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = templateApplySchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { templateId } = validated.data;
    const templateRepository = new TemplateRepository();

    const defaultTemplate = loadDefaultTemplateById(templateId);
    let template: { id: string; type: string; name: string; content: string } | null = null;

    if (defaultTemplate) {
      const createInput = toTemplateCreateInput(defaultTemplate);
      const persisted = await templateRepository.createTemplate(session.user.id, {
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
      const found = await templateRepository.findById(session.user.id, templateId);
      if (found) {
        template = { id: found.id, type: found.type, name: found.name, content: found.content };
      }
    }

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await templateRepository.incrementUseCount(template.id);

    if ((ROUTINE_TYPES as readonly string[]).includes(template.type)) {
      const draft = contentToRoutineDraft(template.content);
      if (draft) {
        const routine = await templateRepository.createRoutineFromTemplate(
          session.user.id,
          template.id,
          { name: draft.name }
        );
        return NextResponse.json({
          success: true,
          data: {
            templateId: template.id,
            type: template.type,
            applied: 'ROUTINE',
            routineTemplateId: routine.id,
          },
        });
      }
    }

    const createdStructures = [
      {
        id: randomUUID(),
        type: template.type,
        name: template.name,
        sourceTemplateId: template.id,
        status: 'PLACEHOLDER',
      },
    ];

    return NextResponse.json({
      success: true,
      data: {
        templateId: template.id,
        type: template.type,
        applied: template.type === 'HABIT_SET' || template.type === 'GOAL_SET' ? template.type : 'CUSTOM',
        createdStructures,
      },
    });
  } catch (error) {
    console.error('Error applying template:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 });
  }
}