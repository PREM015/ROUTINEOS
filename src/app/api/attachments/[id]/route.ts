import { auth } from '@/lib/auth';
import { uploadService } from '@/server/services/upload.service';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/attachments/[id]
 * Fetch attachment metadata for the authenticated owner
 *
 * DELETE /api/attachments/[id]
 * Delete an attachment (row + backing file) owned by the authenticated user
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await ctx.params;
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Invalid attachment id' }, { status: 400 });
    }

    const attachment = await uploadService.getAttachment(userIdFromSession(session), id);
    return NextResponse.json({ success: true, data: attachment });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch attachment' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await ctx.params;
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Invalid attachment id' }, { status: 400 });
    }

    const result = await uploadService.deleteAttachment(userIdFromSession(session), id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }
}