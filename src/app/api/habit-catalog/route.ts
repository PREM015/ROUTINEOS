import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireAdmin } from '@/lib/auth/require-session';
import { HabitCatalogService } from '@/server/services/habit-catalog.service';
import {
  habitDefinitionQuerySchema,
  createHabitDefinitionSchema,
} from '@/schemas/habit.schema';
import { handleError } from '@/lib/errors/error-handler';
import type { Prisma } from '@/generated/prisma';

/**
 * GET /api/habit-catalog — browse the shared catalogue.
 *
 * Open to any signed-in user. There is nothing personal in the response: the
 * rows are suggestions, and the only user-shaped field is `alreadyAdded`,
 * computed against the caller's own habits. No target, log or streak from one
 * user can appear here, because none of those live on `HabitDefinition`.
 *
 * Inactive entries are only included for admins; asking for them otherwise
 * silently ignores the flag rather than erroring, so a non-admin cannot use it
 * as an existence probe.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const parsed = habitDefinitionQuerySchema.safeParse({
      category: searchParams.get('category') || undefined,
      search: searchParams.get('search') || undefined,
      tier: searchParams.get('tier') || undefined,
      includeInactive:
        searchParams.get('includeInactive') === 'true' ? true : undefined,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit') as string, 10)
        : undefined,
      offset: searchParams.get('offset')
        ? parseInt(searchParams.get('offset') as string, 10)
        : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const isAdmin = auth.auth.session.user?.role === 'ADMIN';

    const result = await new HabitCatalogService().browse(auth.auth.userId, {
      ...parsed.data,
      // Non-admins cannot widen the browse, whatever they send.
      includeInactive: isAdmin ? parsed.data.includeInactive : false,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/habit-catalog — create a catalogue entry.
 *
 * Admin only. `requireAdmin` answers 401 without a session and 403 for a
 * non-admin; both happen before any body is parsed or any row is written.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = createHabitDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = await new HabitCatalogService().createDefinition(
      auth.auth.session.user?.role,
      parsed.data as unknown as Prisma.HabitDefinitionCreateInput
    );

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
