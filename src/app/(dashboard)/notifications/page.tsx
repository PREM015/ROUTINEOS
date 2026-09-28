import { NotificationHistory } from '@/components/notifications/NotificationHistory';

export const metadata = {
  title: 'Notifications · RoutineOS',
  description: 'Your full notification history, filterable by category and period.',
};

/**
 * /notifications — the full history.
 *
 * ERROR.md L asks for the navbar bell to show notification history, with
 * category and period filters. The bell renders a short, cheap summary panel;
 * this page holds the complete list so the panel's DOM never grows without
 * bound, and so the list is paginated server-side rather than appended
 * client-side.
 *
 * The filter choices are read from the query string, which is what the bell
 * links to, so arriving from the bell keeps the same category/period selected.
 */
export default function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <NotificationHistory searchParams={searchParams} />;
}
