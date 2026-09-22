import { auth } from '@/lib/auth';
import { notificationService } from '@/server/services/notification.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * PATCH /api/notifications/[id]
 * Update a single notification owned by the user.
 * Body: { action: 'read' | 'dismiss' }
 */

const patchSchema = z.object({
  action: z.enum(['read', 'dismiss']),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const json = await req.json();
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const data =
      parsed.data.action === 'read'
        ? await notificationService.markRead(session.user.id, id)
        : await notificationService.dismiss(session.user.id, id);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bad Request';
    const status = message === 'Notification not found' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}