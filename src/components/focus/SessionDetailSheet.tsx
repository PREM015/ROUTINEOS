'use client';

/**
 * SessionDetailSheet — where a session becomes correctable.
 *
 * The audit's sharpest product finding was that `/focus/session` offered **no way
 * to edit or delete anything**. A user who mis-titled a session, picked the wrong
 * category, or wants a stray 30-second row gone had no recourse at all — the
 * `PATCH` and `DELETE` routes existed and had **zero callers anywhere in `src/`**.
 *
 * So this wires them up, and does two things deliberately:
 *
 *   - **Delete is undoable.** The request is delayed a few seconds, with a Undo
 *     toast in the window. Not because deletes are reversible server-side — they
 *     are not — but because a destructive action reachable by one stray tap on a
 *     phone deserves a pause.
 *   - **The timeline is shown from the event log.** It is the only place the
 *     `FocusSessionEvent` table is visible, and it is what turns "I paused twice"
 *     from a claim into something the user can check.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { ApiError, apiRequest } from '@/lib/api-client';
import { notifyFocusSessionsChanged } from '@/hooks/useFocusSessions';
import {
  FOCUS_END_REASON_LABELS,
  type FocusSessionRow,
} from '@/types/focus';
import type { FocusEventType } from '@/constants/prisma-enums';

interface TimelineEvent {
  id: string;
  type: FocusEventType;
  occurredAt: string;
  label: string | null;
  note: string | null;
}

const EVENT_LABELS: Record<FocusEventType, string> = {
  START: 'Started',
  PAUSE: 'Paused',
  RESUME: 'Resumed',
  EXTEND: 'Extended',
  DISTRACTION: 'Distraction',
  NOTE: 'Note',
  END: 'Ended',
  PAUSE_REASON: 'Paused',
};

/** How long the delete waits for an Undo before it is actually sent. */
const UNDO_WINDOW_MS = 6000;

/**
 * One context link, as a chip.
 *
 * `removed` marks a link whose target has since been archived or deleted. It is shown
 * struck through rather than dropped, because the session genuinely was done against
 * that work - omitting it would make the history disagree with the user's memory of
 * their own afternoon.
 */
function LinkChip({
  kind,
  label,
  removed,
}: {
  kind: string;
  label: string;
  removed: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs',
        removed ? 'text-muted-foreground line-through' : 'text-foreground'
      )}
    >
      <span className="text-muted-foreground/70">{kind}</span>
      <span>{label}</span>
      {removed && <span className="sr-only">(since removed)</span>}
    </span>
  );
}

export function SessionDetailSheet({
  session,
  open,
  onClose,
  onDeleted,
}: {
  session: FocusSessionRow | null;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  /**
   * The form is seeded from `session` on mount, not in an effect.
   *
   * The parent keys this component on `session.id`, so opening a different session
   * remounts it and the state is fresh — no effect, no "compare against the
   * previous id" bookkeeping, and no way for an incoming refetch to discard an edit
   * in progress. That last part is why this is not an effect keyed on `session`:
   * the drawer refetches rows whenever a session ends, and an effect would reset
   * the form out from under someone who was typing a note.
   */
  const [title, setTitle] = useState(() => session?.title ?? '');
  const [notes, setNotes] = useState(() => session?.notes ?? '');
  const [rating, setRating] = useState<number | null>(session?.focusRating ?? null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /**
   * The pending undo timer.
   *
   * A ref on the component, not a module-level variable. Module scope would share
   * one timer across every mounted sheet, so opening a row in two places could
   * cancel the other's pending delete — and the cleanup effect could never cancel
   * it at all, because it would only see its own instance's ref.
   */
  const pendingDelete = useRef<number | null>(null);


  // The timeline is a separate fetch, only while the sheet is open — it is a
  // detail the user asked for by opening a row, not something to prefetch.
  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    void apiRequest<TimelineEvent[]>(`/api/focus/${session.id}/events`)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  const save = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    try {
      await apiRequest(`/api/focus/${session.id}`, {
        method: 'PATCH',
        body: {
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
          focusRating: rating ?? undefined,
        },
      });
      setDirty(false);
      notifyFocusSessionsChanged();
      toast.success('Session updated');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [session, title, notes, rating]);

  /**
   * Delete, with a real undo window.
   *
   * The row is deleted **after** the window, not optimistically-then-recreated.
   * The alternative would need a "restore" endpoint and would leave a deleted row
   * visible if the undo toast was dismissed by a reload — a row that looks deleted
   * and is not is worse than one that is briefly still there.
   */
  const scheduleDelete = useCallback(() => {
    if (!session) return;
    const id = session.id;
    setConfirmingDelete(false);
    toast('Session deleted', {
      duration: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          if (pendingDelete.current !== null) {
            window.clearTimeout(pendingDelete.current);
            pendingDelete.current = null;
          }
          toast.success('Deletion cancelled');
        },
      },
    });
    pendingDelete.current = window.setTimeout(() => {
      pendingDelete.current = null;
      void apiRequest(`/api/focus/${id}`, { method: 'DELETE' })
        .then(() => {
          notifyFocusSessionsChanged();
          onDeleted?.();
        })
        .catch((error: unknown) => {
          toast.error(
            error instanceof ApiError ? error.message : 'Could not delete the session.'
          );
        });
    }, UNDO_WINDOW_MS);
  }, [session, onDeleted]);

  // A pending delete must not fire after the sheet unmounts for another reason, or
  // the user closes the sheet and loses a row they did not mean to lose.
  useEffect(() => {
    return () => {
      if (pendingDelete.current !== null) {
        window.clearTimeout(pendingDelete.current);
        pendingDelete.current = null;
      }
    };
  }, []);

  if (!session) return null;

  const started = new Date(session.startedAt);
  const outcome = session.endReason
    ? FOCUS_END_REASON_LABELS[session.endReason]
    : session.completedAt
      ? 'Completed'
      : session.abortedAt
        ? 'Stopped'
        : 'Running';

  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()} side="right" title="Session">
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Outcome</dt>
            <dd className="font-medium text-foreground">{outcome}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Type</dt>
            <dd className="font-medium text-foreground">{session.type.replace('_', ' ')}</dd>
          </div>
          {/*
            What the session was linked to. Rendered as a list rather than three fixed
            cells because a session usually has one link, not three, and empty cells
            would read as "linked to nothing" three times over.

            A link whose target has been deleted renders as struck-through "removed"
            rather than disappearing: the session *was* done against that task, and
            silently omitting it would make the history disagree with what the user
            remembers doing.
          */}
          {(session.task || session.goal || session.habit) && (
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Context</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {session.task && (
                  <LinkChip
                    kind="Task"
                    label={session.task.title}
                    removed={session.task.status === 'ARCHIVED' || session.task.status === 'DELETED'}
                  />
                )}
                {session.goal && (
                  <LinkChip
                    kind="Goal"
                    label={session.goal.title}
                    removed={session.goal.status === 'ARCHIVED' || session.goal.status === 'DELETED'}
                  />
                )}
                {session.habit && (
                  <LinkChip
                    kind="Habit"
                    label={session.habit.name}
                    removed={session.habit.status === 'ARCHIVED' || session.habit.status === 'DELETED'}
                  />
                )}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Planned</dt>
            <dd className="tabular-nums text-foreground">{session.plannedDuration} min</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Actual</dt>
            {/* No `?? 0`: the old page showed "0 min" for a running session, which
                is a claim about elapsed time the database does not support. */}
            <dd className="tabular-nums text-foreground">
              {session.actualDuration !== null ? `${session.actualDuration} min` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Started</dt>
            <dd className="text-foreground">
              {Number.isNaN(started.getTime()) ? '—' : started.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">
              Paused total
            </dt>
            <dd className="tabular-nums text-foreground">
              {Math.round(session.pausedTotalSeconds / 60)} min
            </dd>
          </div>
        </dl>

        <div>
          <label htmlFor="session-title" className="mb-1 block text-xs font-medium text-foreground">
            Title
          </label>
          <input
            id="session-title"
            value={title}
            maxLength={200}
            onChange={(event) => {
              setTitle(event.target.value);
              setDirty(true);
            }}
            className="h-10 w-full rounded-lg border border-border bg-background/60 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-foreground">
            How focused did it feel?
          </legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setRating(rating === value ? null : value);
                  setDirty(true);
                }}
                aria-pressed={rating === value}
                aria-label={`${value} out of 5`}
                className={cn(
                  'tap-target h-9 w-9 rounded-lg border text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  rating === value
                    ? 'border-transparent bg-accent-focus text-white'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="session-notes" className="mb-1 block text-xs font-medium text-foreground">
            Notes
          </label>
          <textarea
            id="session-notes"
            value={notes}
            maxLength={2000}
            rows={3}
            onChange={(event) => {
              setNotes(event.target.value);
              setDirty(true);
            }}
            placeholder="What happened?"
            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <Button onClick={save} disabled={!dirty || saving} className="w-full">
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Save changes
        </Button>

        {events.length > 0 && (
          <section aria-labelledby="session-timeline-heading">
            <h3
              id="session-timeline-heading"
              className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Timeline
            </h3>
            <ol className="space-y-1.5 border-l border-border pl-3">
              {events.map((event) => (
                <li key={event.id} className="text-xs">
                  <span className="tabular-nums text-muted-foreground">
                    {new Date(event.occurredAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>{' '}
                  <span className="text-foreground">{EVENT_LABELS[event.type]}</span>
                  {event.label ? (
                    <span className="text-muted-foreground"> — {event.label}</span>
                  ) : null}
                  {event.note ? (
                    <p className="mt-0.5 text-muted-foreground">{event.note}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="border-t border-border pt-4">
          {confirmingDelete ? (
            <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 p-3">
              <p className="text-sm text-foreground">
                Delete this session? This cannot be undone once it completes.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={scheduleDelete}
                  className="flex-1"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete session
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  );
}

export default SessionDetailSheet;
