import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { dayTypeSchema } from '@/lib/validation/routine.schema';
import { z } from 'zod';

const routineService = new RoutineService();

/**
 * GET /api/routine/templates
 * List the user's routine templates.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = await routineService.listTemplates(session.user.id);

  return NextResponse.json({ success: true, data: templates });
}

const createTemplateSchema = z.object({
  name: z.string().min(1),
  dayType: dayTypeSchema,
  isDefault: z.boolean().optional(),
});

/**
 * POST /api/routine/templates
 * Create a template. Default-flag exclusivity is enforced by the service.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = createTemplateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Name and valid day type are required.' },
        { status: 400 }
      );
    }

    const template = await routineService.createSimpleTemplate(session.user.id, {
      name: validated.data.name,
      dayType: validated.data.dayType,
      isDefault: validated.data.isDefault,
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    console.error('POST /api/routine/templates error:', error);
    return NextResponse.json(
      { error: 'Failed to create routine template.' },
      { status: 500 }
    );
  }
}

const updateTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  isDefault: z.boolean().optional(),
});

/**
 * PUT /api/routine/templates
 * Update a template's name and/or default flag.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = updateTemplateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'A template id is required.' },
        { status: 400 }
      );
    }

    const template = await routineService.updateTemplate(
      session.user.id,
      validated.data.id,
      { name: validated.data.name, isDefault: validated.data.isDefault }
    );

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('PUT /api/routine/templates error:', error);
    return NextResponse.json(
      { error: 'Failed to update routine template.' },
      { status: 500 }
    );
  }
}
