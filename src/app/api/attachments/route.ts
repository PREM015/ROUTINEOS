import { auth } from '@/lib/auth';
import { AttachmentRepository } from '@/server/repositories/attachment.repository';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/attachments
 * List all attachments for the authenticated user (optionally filtered by entity)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

    const attachmentRepository = new AttachmentRepository();
    const attachments = await attachmentRepository.findAllByUser(session.user.id, {
      limit,
      offset,
      entityType: searchParams.get('entityType') ?? undefined,
      entityId: searchParams.get('entityId') ?? undefined,
    });
    const total = await attachmentRepository.countByUser(session.user.id, {
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