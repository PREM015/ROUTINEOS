'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, History, Timer } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Badge, Button, Card, EmptyState, ListSkeleton } from '@/components/ui';
import { FocusStats } from '@/components/focus/FocusStats';

interface FocusSessionRow {
  id: string;
  title: string;
  description: string | null;
  plannedDuration: number;
  actualDuration: number | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusVariant(status: string): 'primary' | 'success' | 'default' {
  if (status === 'IN_PROGRESS') return 'primary';
  if (status === 'COMPLETED') return 'success';
  return 'default';
}

/**
 * Focus Session Page
 * Shows the current active session (if any) alongside recent session history.
 */
export default function FocusSessionPage() {
  const router = useRouter();
  const [active, setActive] = useState<FocusSessionRow | null>(null);
  const [sessions, setSessions] = useState<FocusSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [activeSession, history] = await Promise.all([
          apiRequest<FocusSessionRow | null>('/api/focus/active'),
          apiRequest<FocusSessionRow[]>('/api/focus', { query: { limit: 20 } }),
        ]);
        if (cancelled) return;
        setActive(activeSession);
        setSessions(history);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load focus sessions');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Timer className="h-7 w-7 text-primary" />
            Focus Session
          </h1>
          <p className="mt-2 text-muted-foreground">
            Review your current session and recent focus history, then start a new timer.
          </p>
        </div>
        <Button onClick={() => router.push('/focus')}>Open timer</Button>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section aria-labelledby="active-session-heading" className="mb-10">
        <h2 id="active-session-heading" className="mb-3 text-xl font-semibold text-foreground">
          Current session
        </h2>
        {active ? (
          <Card className="glass-panel glow-primary p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-foreground">{active.title}</h3>
                {active.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{active.description}</p>
                )}
              </div>
              <Badge variant={statusVariant(active.status)}>{active.status.replaceAll('_', ' ')}</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground/60">Planned</dt>
                <dd className="font-semibold text-foreground">{active.plannedDuration} min</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground/60">Elapsed</dt>
                <dd className="font-semibold text-foreground">{active.actualDuration ?? 0} min</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground/60">Started</dt>
                <dd className="font-semibold text-foreground">{formatDateTime(active.startedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground/60">Completed</dt>
                <dd className="font-semibold text-foreground">
                  {active.completedAt ? formatDateTime(active.completedAt) : '—'}
                </dd>
              </div>
            </dl>
          </Card>
        ) : (
          <EmptyState
            icon={<Clock className="h-10 w-10 text-muted-foreground/60" />}
            title="No active session"
            description="Start a pomodoro from the Focus page to track deep work here."
          />
        )}
      </section>

      <section aria-labelledby="history-heading" className="mb-10">
        <h2 id="history-heading" className="mb-3 flex items-center gap-2 text-xl font-semibold text-foreground">
          <History className="h-5 w-5 text-muted-foreground" />
          Recent sessions
        </h2>
        {!sessions ? (
          <ListSkeleton count={4} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<History className="h-10 w-10 text-muted-foreground/60" />}
            title="No sessions yet"
            description="Your completed focus sessions will show up here."
          />
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{session.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(session.startedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {session.actualDuration ?? session.plannedDuration} min
                    </span>
                    <Badge variant={statusVariant(session.status)}>
                      {session.status.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="focus-stats-heading">
        <h2 id="focus-stats-heading" className="mb-3 text-xl font-semibold text-foreground">
          Focus stats
        </h2>
        <FocusStats />
      </section>
    </div>
  );
}
