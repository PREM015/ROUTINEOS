import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/sleep/session/respond
 * Respond to a pending sleep prompt. YES resolves it into an active session;
 * NOT_YET dismisses it so sleep does not auto-start.
 * Body: { promptId: string, answer: 'YES' | 'NOT_YET' }
 */

const respondSchema = z.object({
  promptId: z.string().min(1),
  answer: z.enum(['YES', 'NOT_YET']),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = respondSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const data = await sleepSessionService.respondToPrompt(
      session.user.id,
      parsed.data.promptId,
      parsed.data.answer
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error responding to sleep prompt:', error);
    return NextResponse.json(
      { error: 'Failed to respond to sleep prompt' },
      { status: 500 }
    );
  }
}