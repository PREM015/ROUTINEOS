import { auth } from '@/lib/auth';
import { attachmentService } from '@/server/services/attachment.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Attachments Route
 * GET /api/attachments
 *
 * Thin handler: the list + count pair and their shared filter live in
 * `AttachmentService`.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { attachments, total, limit, offset } = await attachmentService.list(session.user.id, {
      limit: parseInt(searchParams.get('limit') ?? '50', 10) || 50,
      offset: Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0),
      entityType: searchParams.get('entityType') ?? undefined,
      entityId: searchParams.get('entityId') ?? undefined,
    });

    return NextResponse.json({
      success: true,
      data: attachments,
      meta: { total, limit, offset },
    });
  } catch (error) {
    console.error('Error fetching attachments:', error);
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 });
  }
}
