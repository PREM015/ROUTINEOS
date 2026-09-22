import { auth } from '@/lib/auth';
import { notificationService } from '@/server/services/notification.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/notifications
 * Get the user's recent notifications plus the unread badge count.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20)
    );

    const [notifications, unreadCount] = await Promise.all([
      notificationService.getNotifications(session.user.id, { limit }),
      notificationService.getUnreadCount(session.user.id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}