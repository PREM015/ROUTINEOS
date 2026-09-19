import { auth } from '@/lib/auth';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { getFocusSessionStatus } from '@/types/focus';
import { NextResponse } from 'next/server';

/**
 * GET /api/focus/active
 * Fetch the current active/paused focus session for today, or null
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repository = new FocusRepository();
    const active = await repository.findActiveByUserId(session.user.id);

    if (!active) {
      return NextResponse.json({ success: true, data: null });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Only sessions started today count as the "current" active session
    if (active.startedAt < startOfToday || active.startedAt >= endOfToday) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...active,
        status: getFocusSessionStatus(active),
      },
    });
  } catch (error) {
    console.error('Error fetching active focus session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active focus session' },
      { status: 500 }
    );
  }
}