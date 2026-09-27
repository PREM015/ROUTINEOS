import { auth } from '@/lib/auth';
import { backupService } from '@/server/services/backup.service';
import type { ExportFormat } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const exportRequestSchema = z.object({
  format: z.enum(['JSON', 'CSV', 'PDF', 'MARKDOWN']),
  includeArchived: z.boolean().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/export/request
 *
 * Requests a full data export. The service owns the whole lifecycle: it records
 * the request, serialises the user's data, writes the file, and marks the row
 * completed (or failed).
 *
 * The previous version of this route duplicated that orchestration inline and
 * returned a `/api/export/download/{id}` URL for a file it never wrote, so the
 * download endpoint 404'd. It now shares the single implementation in
 * `BackupService`.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = exportRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const result = await backupService.createExport(session.user.id, {
      format: validated.data.format as ExportFormat,
      includeAttachments: validated.data.includeArchived,
      dateFrom: validated.data.startDate,
      dateTo: validated.data.endDate,
    });

    return NextResponse.json({
      success: true,
      data: {
        exportId: result.exportId,
        fileUrl: `/api/export/download/${result.exportId}`,
        fileSize: result.fileSize ?? 0,
        expiresAt: result.expiresAt,
      },
    });
  } catch (error) {
    console.error('Error requesting export:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to request export' },
      { status: 500 }
    );
  }
}
