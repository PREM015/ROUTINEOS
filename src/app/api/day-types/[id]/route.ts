import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { DayTypeService } from '@/server/services/day-type.service';
import { z } from 'zod';

const dayTypeService = new DayTypeService();

const updateDayTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  icon: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/** Ownership check. Returns the row, or a 404 `NextResponse`. */
async function getDayTypeOr404(userId: string, id: string) {
  const dayType = await dayTypeService.getDayType(userId, id);
  if (!dayType) {
    return NextResponse.json({ error: 'Day type not found' }, { status: 404 });
  }
  return dayType;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const dayType = await getDayTypeOr404(session.user.id, id);

  if (dayType instanceof NextResponse) return dayType;

  return NextResponse.json({ success: true, data: dayType });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const current = await getDayTypeOr404(session.user.id, id);
    if (current instanceof NextResponse) return current;

    const body = await req.json();
    const data = updateDayTypeSchema.parse(body);

    // `DayTypeService` owns slug-uniqueness and the single-default invariant,
    // so this stays a thin delegate.
    const updated = await dayTypeService.updateDayType(session.user.id, id, data);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error) {
      // Domain rule violations (duplicate slug, archiving a default day type)
      // are client errors, not server faults.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error updating day type:', error);
    return NextResponse.json({ error: 'Failed to update day type' }, { status: 500 });
  }
}

/**
 * DELETE /api/day-types/[id]
 *
 * Archives by default (`isArchived = true`). A hard delete is available via
 * `?permanent=true` for a definition the user explicitly wants gone; the
 * service refuses to archive a default day type or the last active one.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const permanent = req.nextUrl.searchParams.get('permanent') === 'true';

  try {
    if (permanent) {
      const current = await getDayTypeOr404(session.user.id, id);
      if (current instanceof NextResponse) return current;

      const deleted = await dayTypeService.deleteDayType(session.user.id, id);
      return NextResponse.json({ success: true, data: deleted, message: 'Day type permanently deleted' });
    }

    const archived = await dayTypeService.archiveDayType(session.user.id, id);
    return NextResponse.json({
      success: true,
      data: archived,
      message: 'Day type archived. Existing overrides keep working.',
    });
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message === 'Day type not found' ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('Error archiving day type:', error);
    return NextResponse.json({ error: 'Failed to archive day type' }, { status: 500 });
  }
}
