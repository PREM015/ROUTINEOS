'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * ## Milestones
 *
 * The backend for this has existed the whole time — `GET`/`POST
 * /api/goals/[id]/milestones`, `GoalService.getMilestones`, `addMilestone` — and
 * **nothing in the app ever called it**. Five components sat dead in
 * `components/goals/` partly because of it.
 *
 * Milestones are worth having on a long-term goal for one reason: they break a
 * single "42 / 100" into steps you can actually tick, which is the difference
 * between a number that moves and a plan. A goal with no milestones has nothing
 * between "started" and "finished".
 *
 * ### Loaded on open, not with the page
 *
 * The goal list already selects a milestone *count* per goal, so the drawer can
 * say "3 of 5" without a request. The rows themselves are fetched when the drawer
 * opens, because twelve goals' worth of milestones is a payload nobody should pay
 * for on a page that shows two of those goals at a time.
 */

export interface Milestone {
  id: string;
  title: string;
  description?: string | null;
  targetValue?: number | null;
  dueDate?: string | null;
  completedAt?: string | null;
}

export interface MilestonesPanelProps {
  goalId: string;
  /** From the list payload, so the heading can say "2 of 5" immediately. */
  totalCount?: number;
  /** Re-reads after a write; the page owns the goal row. */
  onChanged?: () => void;
}

export function MilestonesPanel({ goalId, totalCount, onChanged }: MilestonesPanelProps) {
  const [rows, setRows] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<Milestone[]>(`/api/goals/${goalId}/milestones`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load milestones');
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    setLoading(true);
    // Cleared on goal change, not just masked by the skeleton. Switching goals in
    // the drawer used to show the previous goal's milestones for the duration of
    // the fetch, which on a fast connection meant a flash of the wrong steps
    // under the right title - and a click landing on them writes to the wrong
    // goal.
    setRows([]);
    setError(null);
    void load();
  }, [load]);

  const toggle = useCallback(
    async (milestone: Milestone) => {
      setBusyId(milestone.id);
      setError(null);
      // Optimistic: the checkbox is the whole interaction and a round trip makes
      // it feel broken. Rolled back from the server's own response on failure.
      const next = milestone.completedAt === null || milestone.completedAt === undefined;
      setRows((prev) =>
        prev.map((m) =>
          m.id === milestone.id
            ? { ...m, completedAt: next ? new Date().toISOString() : null }
            : m
        )
      );
      try {
        await apiRequest(`/api/goals/${goalId}/milestones/${milestone.id}`, {
          method: 'PATCH',
          body: { completed: next },
        });
        onChanged?.();
      } catch (err) {
        setRows((prev) =>
          prev.map((m) =>
            m.id === milestone.id ? { ...m, completedAt: milestone.completedAt ?? null } : m
          )
        );
        setError(err instanceof Error ? err.message : 'Could not update that milestone');
      } finally {
        setBusyId(null);
      }
    },
    [goalId, onChanged]
  );

  const add = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const title = draft.trim();
      if (!title || saving) return;

      setSaving(true);
      setError(null);
      try {
        await apiRequest(`/api/goals/${goalId}/milestones`, {
          method: 'POST',
          body: { title },
        });
        setDraft('');
        setAdding(false);
        await load();
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add that milestone');
      } finally {
        setSaving(false);
      }
    },
    [draft, goalId, load, onChanged, saving]
  );

  const remove = useCallback(
    async (milestone: Milestone) => {
      setBusyId(milestone.id);
      setError(null);
      try {
        await apiRequest(`/api/goals/${goalId}/milestones/${milestone.id}`, {
          method: 'DELETE',
        });
        setRows((prev) => prev.filter((m) => m.id !== milestone.id));
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not remove that milestone');
      } finally {
        setBusyId(null);
      }
    },
    [goalId, onChanged]
  );

  const done = rows.filter((m) => m.completedAt).length;
  // Prefer the fetched count; fall back to the list payload's so the heading is
  // correct on the very first paint rather than popping in a beat later.
  const total = rows.length || totalCount || 0;

  return (
    <section aria-labelledby="drawer-milestones">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4
          id="drawer-milestones"
          className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
        >
          Milestones
          {total > 0 && (
            <span className="ml-1.5 tabular-nums text-foreground/70">
              {done} / {total}
            </span>
          )}
        </h4>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Add
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className="mb-2 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What has to be true?"
            autoFocus
            className="flex-1"
            aria-label="Milestone title"
          />
          <Button type="submit" size="sm" variant="primary" isLoading={saving}>
            Add
          </Button>
        </form>
      )}

      {loading ? (
        <div className="space-y-1.5" aria-busy="true" aria-label="Loading milestones">
          {[0, 1].map((i) => (
            <div key={i} className="h-6 rounded bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 && !adding ? (
        <p className="text-[11px] text-muted-foreground">
          No steps yet. A goal with two or three milestones is far easier to finish
          than one number.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((milestone) => {
            const complete = Boolean(milestone.completedAt);
            const busy = busyId === milestone.id;
            return (
              <li key={milestone.id} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggle(milestone)}
                  disabled={busy}
                  aria-pressed={complete}
                  aria-label={
                    complete
                      ? `Reopen ${milestone.title}`
                      : `Mark ${milestone.title} done`
                  }
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    complete
                      ? 'border-transparent bg-pace-ahead text-primary-foreground'
                      : 'border-border text-muted-foreground hover:border-pace-ahead'
                  )}
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                </button>

                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-xs',
                    complete
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  )}
                >
                  {milestone.title}
                </span>

                <button
                  type="button"
                  onClick={() => void remove(milestone)}
                  disabled={busy}
                  aria-label={`Remove ${milestone.title}`}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

export default MilestonesPanel;
