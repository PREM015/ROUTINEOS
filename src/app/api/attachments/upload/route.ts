import { auth } from '@/lib/auth';
import { uploadService } from '@/server/services/upload.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/attachments/upload
 * Upload a file for the authenticated user. Accepts multipart/form-data
 * with a single `file` field and optional `entityType` / `entityId`.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const entityType = formData.get('entityType')?.toString() ?? undefined;
    const entityId = formData.get('entityId')?.toString() ?? undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await uploadService.createAttachment(
      session.user.id,
      {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        buffer,
      },
      { entityType, entityId }
    );

    return NextResponse.json({ success: true, data: attachment }, { status: 201 });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}