import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/sleep/session/wake-confirm
 * Respond to a wake confirmation prompt.
 * Body: { promptId: string, action: 'woke-at-target' | 'woke-later' | 'still-sleeping', actualWakeTime?: string }
 */

const wakeConfirmSchema = z.object({
  promptId: z.string().min(1),
  action: z.enum(['woke-at-target', 'woke-later', 'still-sleeping']),
  actualWakeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = wakeConfirmSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const data = await sleepSessionService.respondToWakePrompt(
      userIdFromSession(session),
      parsed.data.promptId,
      parsed.data.action,
      parsed.data.actualWakeTime
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error responding to wake confirmation:', error);
    return NextResponse.json(
      { error: 'Failed to respond to wake confirmation' },
      { status: 500 }
    );
  }
}