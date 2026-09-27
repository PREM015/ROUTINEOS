import { z } from 'zod';
import { auth } from '@/lib/auth';
import { bulkService } from '@/server/services/bulk.service';
import { NextRequest, NextResponse } from 'next/server';

const bulkDeleteSchema = z.object({
  type: z.enum(['habit', 'goal', 'task']),
  ids: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * POST /api/bulk/delete
 * Permanently delete multiple habits, goals or tasks scoped to the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = bulkDeleteSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { type, ids } = validated.data;
    const results = await bulkService.remove(session.user.id, type, ids);
    const succeeded = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      data: { results },
      meta: {
        type,
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
      },
    });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 });
  }
}
