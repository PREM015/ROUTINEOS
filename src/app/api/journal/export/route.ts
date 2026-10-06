import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { ForeignTagError } from '@/lib/journal/policy';
import { journalService } from '@/server/services/journal.service';
import { journalExportQuerySchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/journal/export
 * Download the entries matching a filter set as Markdown or JSON.
 *
 * Accepts the same filters as the list, so "export what I am looking at" is
 * literally that — the same query string, with `limit`/`offset` deliberately
 * absent. A paginated export would be a truncated one presented as a complete
 * backup, which is worse than no export at all.
 *
 * `lib/journal/export.ts` already serialised both formats and had no caller.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = journalExportQuerySchema.safeParse({
      format: searchParams.get('format') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      mood: searchParams.get('mood') ?? undefined,
      isFavorite: searchParams.get('isFavorite') ?? undefined,
      isArchived: searchParams.get('isArchived') ?? undefined,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      date: searchParams.get('date') ?? undefined,
      month: searchParams.get('month') ?? undefined,
      tagId: searchParams.get('tagId') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { format, ...filters } = validated.data;
    // `date`, `month` and an explicit range all narrow through the service, so
    // this route does not expand them itself. That duplication is how the list
    // and the export came to disagree about which day was being exported.
    const result = await journalService.exportEntries(userIdFromSession(session), format, filters);

    // Surfaced as a header so the browser download can report it: the file is
    // a real partial backup, not a silently clipped one.
    const headers: Record<string, string> = {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(Buffer.byteLength(result.body, 'utf8')),
      'Cache-Control': 'no-store',
    };
    if (result.truncated) {
      headers['X-Journal-Export-Truncated'] = String(result.count);
    }

    return new NextResponse(result.body, { status: 200, headers });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }
    if (error instanceof ForeignTagError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Error exporting journal entries:', error);
    return NextResponse.json({ error: 'Failed to export journal entries' }, { status: 500 });
  }
}
