/**
 * Notifications zustand store.
 *
 * Holds the notification feed and unread count. Fetching hits the real API
 * route:
 *   GET /api/notifications
 *
 * There is no dedicated mark-read/mark-all endpoint yet, so read state is
 * managed locally (markRead/markAllRead mutate the store) and the feed is
 * re-fetched after mutations so server-side state stays the source of truth
 * once the route exists.
 */

import { create } from 'zustand';
import { apiRequest } from '@/lib/api-client';
import type { NotificationLog } from '@prisma/client';

interface NotificationsResponse {
  notifications: NotificationLog[];
  unreadCount: number;
}

interface NotificationsState {
  notifications: NotificationLog[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  fetchNotifications: () => Promise<NotificationLog[]>;
  markAllRead: () => void;
  markRead: (id: string) => void;
  addNotification: (notification: NotificationLog) => void;
  clear: () => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  /**
   * Fetch the notification feed via GET /api/notifications.
   */
  fetchNotifications: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<NotificationsResponse>('/api/notifications');
      set({
        notifications: data.notifications,
        unreadCount: data.unreadCount,
        loading: false,
      });
      return data.notifications;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch notifications');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Mark every notification as read locally. A re-fetch will reconcile this
   * against the server once a mark-all route exists.
   */
  markAllRead: () => {
    const now = new Date().toISOString();
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.readAt ? notification : { ...notification, readAt: now }
      ),
      unreadCount: 0,
    }));
  },

  /**
   * Mark a single notification as read locally.
   */
  markRead: (id) => {
    const target = get().notifications.find((n) => n.id === id);
    if (!target) return;

    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === id
          ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() }
          : notification
      ),
      unreadCount: get().unreadCount,
    }));

    set((state) => ({
      unreadCount: state.notifications.filter((n) => !n.readAt).length,
    }));
  },

  /**
   * Prepend a locally-originated notification (e.g. after an action that
   * would normally schedule one).
   */
  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.readAt ? 0 : 1),
    }));
  },

  clear: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  reset: () => {
    set({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
    });
  },
}));