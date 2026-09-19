import { auth } from '@/lib/auth';
import { backupService } from '@/server/services/backup.service';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/export/status/[id]
 * Fetch the status of a data export owned by the authenticated user.
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

    const exportRow = await backupService.getExport(session.user.id, id);

    return NextResponse.json({ success: true, data: exportRow });
  } catch (error) {
    console.error('Error fetching export status:', error);

    if (error instanceof Error && error.message === 'Export not found') {
      return NextResponse.json({ error: 'Export not found' }, { status: 404 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch export status' },
      { status: 500 }
    );
  }
}