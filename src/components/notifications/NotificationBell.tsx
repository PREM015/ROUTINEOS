'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';

/**
 * Navbar notification bell.
 *
 * ERROR.md L originally asked for the bell to open a history panel. It was first
 * implemented as a dropdown, but the user asked for the simpler and more
 * predictable behaviour: clicking the bell navigates to the full history page at
 * `/notifications`, and the notification **settings** link lives on that page
 * rather than behind the bell.
 *
 * That is better for performance too — the bell no longer fetches, renders and
 * filters a list on every page load. It only reads the unread count, which the
 * history page owns in full.
 *
 * The 60-second poll is kept so a reminder delivered by the scheduler shows a
 * fresh badge without a manual refresh.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const data = await apiRequest<{ unreadCount: number }>(
          '/api/notifications?limit=1'
        );
        if (!cancelled) setUnread(data.unreadCount);
      } catch {
        // A failed unread count must never break the header, and a stale badge is
        // far better than an error state here.
      }
    };

    void read();
    const timer = setInterval(() => void read(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      title="Notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span
          className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
          aria-hidden="true"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
