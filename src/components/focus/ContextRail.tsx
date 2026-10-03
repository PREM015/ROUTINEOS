'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { useFocusStore } from '@/store/focus.store';
import { Link2, Link2Off } from 'lucide-react';

/**
 * Links the running session to what it is actually for.
 *
 * ## Why this exists when the schema already had the columns
 *
 * `FocusSession.taskId/goalId/habitId` were present and indexed, the start payload
 * already carried them, and `FocusService.assertLinkOwnership` already validated them
 * before the write. Nothing set them, so every session was unattached and the columns
 * were dead weight. The gap was purely the input.
 *
 * ## Ownership
 *
 * Every link is `onDelete: SetNull`, so a foreign id would not fail the insert - it
 * would quietly attach the session to somebody else's task and corrupt their roll-ups.
 * The server checks each link before writing; this component only narrows the choice to
 * the user's own rows, which is a convenience, not the guarantee.
 *
 * ## Hidden while a session is live
 *
 * `plannedMs` and the deadline are settled at Start. Re-pointing a running session at a
 * different task would make the history row disagree with what the user watched
 * themselves do, so the rail is editable only while idle.
 */

interface TaskOption {
  id: string;
  title: string;
  status?: string;
}

interface GoalOption {
  id: string;
  title: string;
  status?: string;
}

interface HabitOption {
  id: string;
  name: string;
  status?: string;
}

/** Anything not on an explicit allow-list is treated as not-worth-offering. */
const OPEN_STATUSES = new Set(['ACTIVE', 'IN_PROGRESS', 'PENDING', 'TODO']);

function openOnly<T extends { status?: string }>(rows: T[] | undefined): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => !row.status || OPEN_STATUSES.has(row.status));
}

export function ContextRail({ className }: { className?: string }) {
  const status = useFocusStore((s) => s.status);
  const taskId = useFocusStore((s) => s.taskId);
  const goalId = useFocusStore((s) => s.goalId);
  const habitId = useFocusStore((s) => s.habitId);
  const adopt = useFocusStore((s) => s.adopt);

  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [habits, setHabits] = useState<HabitOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  // One effect, three requests. These are the same shapes the rest of the dashboard
  // already loads, and firing them per-picker would re-request on every mount.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiRequest<TaskOption[]>('/api/tasks').catch(() => [] as TaskOption[]),
      apiRequest<GoalOption[]>('/api/goals').catch(() => [] as GoalOption[]),
      apiRequest<HabitOption[]>('/api/habits').catch(() => [] as HabitOption[]),
    ])
      .then(([t, g, h]) => {
        if (cancelled) return;
        setTasks(openOnly(t));
        setGoals(openOnly(g));
        setHabits(openOnly(h));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load your items.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const taskOptions = useMemo(
    () => [
      { value: '', label: 'No task' },
      ...tasks.map((t) => ({ value: t.id, label: t.title })),
    ],
    [tasks]
  );
  const goalOptions = useMemo(
    () => [
      { value: '', label: 'No goal' },
      ...goals.map((g) => ({ value: g.id, label: g.title })),
    ],
    [goals]
  );
  const habitOptions = useMemo(
    () => [
      { value: '', label: 'No habit' },
      ...habits.map((h) => ({ value: h.id, label: h.name })),
    ],
    [habits]
  );

  const linked = Boolean(taskId || goalId || habitId);
  // The rows a running session has already committed to.
  const locked = status === 'running' || status === 'paused';

  if (error) {
    return (
      <p className={className} role="alert">
        {error}
      </p>
    );
  }

  return (
    <section className={className} aria-label="What this session is for">
      <div className="mb-2 flex items-center gap-2">
        {linked ? (
          <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Link2Off className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
        <h2 className="text-sm font-semibold text-foreground">Context</h2>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Select
          label="Task"
          options={taskOptions}
          value={taskId ?? ''}
          disabled={locked || tasks.length === 0}
          onChange={(event) => adopt({ taskId: event.target.value || null })}
          helperText={
            locked ? 'Fixed for the length of this session.' : tasks.length === 0 ? 'No open tasks.' : undefined
          }
        />
        <Select
          label="Goal"
          options={goalOptions}
          value={goalId ?? ''}
          disabled={locked || goals.length === 0}
          onChange={(event) => adopt({ goalId: event.target.value || null })}
          helperText={locked ? undefined : goals.length === 0 ? 'No open goals.' : undefined}
        />
        <Select
          label="Habit"
          options={habitOptions}
          value={habitId ?? ''}
          disabled={locked || habits.length === 0}
          onChange={(event) => adopt({ habitId: event.target.value || null })}
          helperText={locked ? undefined : habits.length === 0 ? 'No active habits.' : undefined}
        />
      </div>
    </section>
  );
}

export default ContextRail;