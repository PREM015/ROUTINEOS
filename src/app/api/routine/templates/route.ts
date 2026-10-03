import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { dayTypeSchema } from '@/lib/validation/routine.schema';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const routineService = new RoutineService();

/**
 * GET /api/routine/templates?dayTypeId=<id>
 * List the user's routine templates.
 *
 * `dayTypeId` narrows to the one template linked to that `DayTypeDefinition`.
 *
 * It exists because `/routine` loads exactly ONE day type's blocks for speed
 * (the resolved one), which left every other tab on the day-type strip
 * permanently empty — clicking "College" showed "no blocks" even when College
 * had a full template, because nothing had been fetched for it. This lets the
 * page fetch the tab the user actually clicked and nothing more, which is the
 * difference between one extra request on a deliberate switch and the
 * all-templates request the page deliberately stopped making.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const requested = request.nextUrl.searchParams.get('dayTypeId');

  if (requested !== null) {
    if (!z.string().min(1).safeParse(requested).success) {
      return NextResponse.json({ error: 'Invalid dayTypeId' }, { status: 400 });
    }
    const template = await routineService.getTemplateForDayTypeId(
      userIdFromSession(session),
      requested
    );
    return NextResponse.json({ success: true, data: template ? [template] : [] });
  }

  const templates = await routineService.listTemplates(userIdFromSession(session));

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

    const template = await routineService.createSimpleTemplate(userIdFromSession(session), {
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
      userIdFromSession(session),
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
