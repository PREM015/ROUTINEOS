import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { focusSettingsPatchSchema } from '@/schemas/focus.schema';
import { userIdFromSession } from '@/types/ids';
import { AppError } from '@/lib/errors/app-error';

/**
 * GET /api/focus/settings
 *
 * The user's focus configuration. Created with the schema defaults on first read, so
 * a client never has to handle a null and never has to carry its own defaults - the
 * hardcoded 25-minute block this replaced lived in two components and drifted from
 * `FocusSettings` immediately.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await focusService.getSettings(userIdFromSession(session));
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error loading focus settings:', error);
    return NextResponse.json({ error: 'Failed to load focus settings' }, { status: 500 });
  }
}

/**
 * PUT /api/focus/settings
 *
 * A **patch**, not a replace. The settings page saves one section at a time, so a
 * replace would reset every field the client did not send - the failure mode already
 * documented on `UserSettings.updateSettingsSchema`.
 */
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = focusSettingsPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // `focusSettingsPatchSchema` is a plain `z.object`, so unknown keys are stripped
    // rather than rejected. That is deliberate - a client sending a field this server
    // does not know about should not fail the whole save - but it also means a typo'd
    // key is dropped silently, so the response echoes what was actually applied.
    const settings = await focusService.updateSettings(userIdFromSession(session), parsed.data);
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating focus settings:', error);
    return NextResponse.json({ error: 'Failed to update focus settings' }, { status: 500 });
  }
}