import { auth } from '@/lib/auth';
import { backupService } from '@/server/services/backup.service';
import { ExportFormat, ExportStatus, type DataExport } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Map an export format to a response Content-Type.
 */
function contentTypeFor(format: ExportFormat): string {
  switch (format) {
    case ExportFormat.CSV:
      return 'text/csv; charset=utf-8';
    case ExportFormat.PDF:
      return 'application/pdf';
    case ExportFormat.MARKDOWN:
      return 'text/markdown; charset=utf-8';
    default:
      return 'application/json; charset=utf-8';
  }
}

/**
 * GET /api/export/download/[id]
 * Download a completed data export file owned by the authenticated user.
 * Returns 409 when the export has not finished processing yet.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid export id' }, { status: 400 });
    }

    let exportRow: DataExport;
    try {
      exportRow = await backupService.getExport(session.user.id, id);
    } catch (error) {
      if (error instanceof Error && error.message === 'Export not found') {
        return NextResponse.json({ error: 'Export not found' }, { status: 404 });
      }
      throw error;
    }

    if (
      exportRow.status !== ExportStatus.COMPLETED ||
      !exportRow.fileUrl ||
      !exportRow.fileSize
    ) {
      return NextResponse.json(
        { error: 'Export is not ready yet' },
        { status: 409 }
      );
    }

    const fileName = path.basename(exportRow.fileUrl);
    const filePath = path.join(
      process.cwd(),
      'public',
      'uploads',
      'exports',
      session.user.id,
      fileName
    );

    let bytes: Buffer;
    try {
      bytes = await fs.readFile(filePath);
    } catch (error) {
      console.error('Error reading export file:', error);
      return NextResponse.json(
        { error: 'Export file is missing' },
        { status: 404 }
      );
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(exportRow.format),
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (error) {
    console.error('Error downloading export:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to download export' },
      { status: 500 }
    );
  }
}