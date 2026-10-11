import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { focusService } from '@/server/services/focus.service';
import { focusPresetInputSchema } from '@/schemas/focus.schema';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/focus/presets
 *
 * The user's timer presets, for the mode picker. Archived presets are excluded by
 * default: `isArchived` exists so a preset referenced by a session's history can leave
 * the picker without breaking the past, which is the opposite of hiding it.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const includeArchived = new URL(request.url).searchParams.get('archived') === 'true';
    const presets = await focusService.listPresets(userIdFromSession(session), includeArchived);
    return NextResponse.json({ success: true, data: presets });
  } catch (error) {
    return handleError(error);
  }
}

/** POST /api/focus/presets */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = focusPresetInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const preset = await focusService.createPreset(userIdFromSession(session), parsed.data);
    return NextResponse.json({ success: true, data: preset }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}