import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  dayType: z.enum(['WORKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM']),
  isDefault: z.boolean().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

/**
 * GET /api/routine
 * Get all routine templates for user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const routineService = new RoutineService();
    const templates = await routineService['routineRepository'].findAllTemplates(
      session.user.id
    );

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error fetching routine templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch routine templates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/routine
 * Create new routine template
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createTemplateSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const routineService = new RoutineService();
    const template = await routineService.createTemplate(
      session.user.id,
      validated.data
    );

    return NextResponse.json(
      { success: true, data: template },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating routine template:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to create routine template' },
      { status: 500 }
    );
  }
}