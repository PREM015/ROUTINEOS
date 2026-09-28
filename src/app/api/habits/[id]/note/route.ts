import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const noteSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  note: z.string().max(2000).nullable(),
});

/**
 * PATCH /api/habits/[id]/note
 * Attach or clear the note on a habit log for one date.
 *
 * The Notes panel used to save through `POST /api/habits/[id]/log` with
 * `status: 'COMPLETED'`, which meant writing a note also logged a completion
 * and advanced the streak — and on a day the habit was not scheduled, the
 * service's eligibility guard rejected the COMPLETED status so the note could
 * not be saved at all. Notes are metadata, so they get their own endpoint and
 * never touch `status`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const validated = noteSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habitService = new HabitService();
    const trimmed = validated.data.note?.trim() || null;
    const log = await habitService.setNote(
      session.user.id,
      id,
      validated.data.date,
      trimmed
    );

    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error('Error saving habit note:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to save note' },
      { status: 500 }
    );
  }
}
