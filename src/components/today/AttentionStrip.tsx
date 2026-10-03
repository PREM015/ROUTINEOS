'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/**
 * A single line, spanning the page, listing what is currently going wrong.
 *
 * ## Why this exists
 *
 * Four notification types fire and then go nowhere: `HABIT_MISSED`,
 * `HABIT_STREAK_AT_RISK`, `GOAL_AT_RISK` and `TASK_OVERDUE`. They surface in the
 * OS notification centre and in `/notifications`, but `/today` — the page people
 * actually open — showed no sign of them. A streak about to break or a goal
 * going stale is exactly the kind of thing that is worth surfacing unprompted.
 *
 * ## Why it is a strip and not a card
 *
 * This is a page-level concern, not one that belongs inside Score, Habits or
 * Goals, so burying it in any of them would be semantically wrong. Giving it a
 * card of its own would make a ninth competing surface on a page that already
 * has eight. A slim full-width row is the cheapest honest presentation.
 *
 * ## Cost
 *
 * One request to an existing route (`/api/notifications`, filtered to unread),
 * no new endpoint and no new server query.
 *
 * ## Restraint
 *
 * Renders **nothing** when there is nothing wrong, and caps at three items plus
 * an overflow count. It is a nudge, not an inbox — a page that greets you with a
 * wall of warnings gets ignored, and then the streak it was warning about really
 * does break.
 */

const WATCHED = new Set([
  'HABIT_MISSED',
  'HABIT_STREAK_AT_RISK',
  'GOAL_AT_RISK',
  'TASK_OVERDUE',
]);

const MAX_SHOWN = 3;

interface AlertRow {
  id: string;
  type?: string;
  title?: string | null;
  actionUrl?: string | null;
}

export function AttentionStrip() {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/notifications?unreadOnly=true&limit=50', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json: unknown = await res.json().catch(() => null);
        if (cancelled || !json || typeof json !== 'object') return;

        const rows = (json as { data?: unknown }).data;
        if (!Array.isArray(rows)) return;

        const filtered = rows
          .filter((row): row is AlertRow => {
            const r = row as { id?: unknown; type?: unknown };
            return typeof r.id === 'string' && typeof r.type === 'string' && WATCHED.has(r.type);
          })
          .slice(0, MAX_SHOWN);

        if (!cancelled) setAlerts(filtered);
      } catch {
        // Offline — stay silent rather than showing an error where a nudge goes.
      }
    };

    void load();
    const interval = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5 text-sm">
      <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Needs attention
      </span>

      {alerts.map((alert) => {
        const label = alert.title?.trim() || 'Review';
        const content = (
          <span className="text-muted-foreground underline-offset-2 hover:underline">
            {label}
          </span>
        );

        return alert.actionUrl ? (
          <Link
            key={alert.id}
            href={alert.actionUrl}
            className="min-w-0 truncate rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {content}
          </Link>
        ) : (
          <span key={alert.id} className="min-w-0 truncate">
            {content}
          </span>
        );
      })}
    </div>
  );
}
