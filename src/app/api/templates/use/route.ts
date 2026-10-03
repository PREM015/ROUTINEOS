import { auth } from '@/lib/auth';
import { templateService } from '@/server/services/template.service';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

const templateApplySchema = z.object({
  templateId: z.string().min(1, 'templateId is required'),
});

/**
 * Template Use Route
 * POST /api/templates/use – apply a template (build a routine or create a
 *                           placeholder structure for habit/goal sets)
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

    const data = await templateService.applyTemplate(
      userIdFromSession(session),
      validated.data.templateId
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'Template not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error applying template:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 });
  }
}
