import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { DayTypeService } from '@/server/services/day-type.service';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const dayTypeService = new DayTypeService();

const createDayTypeSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * GET /api/day-types
 * List the user's day-type definitions, including archived ones.
 *
 * Archived rows are included (with usage counts) because this is the list the
 * routine-management page uses, and it needs to show — and un-archive — them.
 * The day-type picker on `/today` and `/dashboard` needs the *active* subset
 * instead, which the same endpoint already filters server-side per caller via
 * `?active=true`.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // `?active=true` returns only non-archived definitions without counts, which
  // is what a picker needs; the default is the full management list.
  if (req.nextUrl.searchParams.get('active') === 'true') {
    const dayTypes = await dayTypeService.listDayTypes(userIdFromSession(session));
    return NextResponse.json({ success: true, data: dayTypes });
  }

  const dayTypes = await dayTypeService.listAllDayTypes(userIdFromSession(session));

  return NextResponse.json({ success: true, data: dayTypes });
}

/**
 * POST /api/day-types
 * Create a day type. Slug normalisation, slug uniqueness and default-flag
 * exclusivity are all enforced by DayTypeService.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = createDayTypeSchema.parse(body);

    const dayType = await dayTypeService.createDayType(userIdFromSession(session), data);

    return NextResponse.json({ success: true, data: dayType }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
    }
    // Domain rule violations (duplicate slug, bad slug) are client errors.
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating day type:', error);
    return NextResponse.json({ error: 'Failed to create day type' }, { status: 500 });
  }
}
