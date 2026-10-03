'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Archive } from 'lucide-react';
import { Modal } from '@/components/ui';
import { Button } from '@/components/ui';
import { apiRequest } from '@/lib/api-client';

/**
 * ## Delete confirmation — F13
 *
 * The old overlay declared `role="alertdialog"` and `aria-modal="true"` and
 * implemented none of it: no focus trap, no Escape, no initial focus, no focus
 * restoration. That is worse than no role at all, because a screen reader is
 * told the page behind is inert while keyboard focus still walks straight into
 * controls hidden under the scrim, and the universal "get me out of here" key
 * does nothing. This uses the shared `Modal`, which does all four.
 *
 * ## The loss summary — F5
 *
 * `Task.goalId` and `TimeEntry.goalId` both lack an `onDelete`, so a goal with
 * either attached could not be deleted at all — the request failed with an opaque
 * foreign-key violation. The delete now detaches them instead, which means the
 * outcome is genuinely two-sided:
 *
 * - **destroyed**: progress history, milestones, tags, sub-goal links
 * - **unlinked**: tasks and time entries, which survive and keep their content
 *
 * Those are very different operations, and `GET /api/goals/[id]?impact=true`
 * counts both so the user can read which one they are agreeing to. Archive is
 * offered first and is the safe default; delete is visually quiet and last.
 */

export interface DeleteImpact {
  goalId: string;
  title: string;
  tasks: number;
  timeEntries: number;
  progressLogs: number;
  milestones: number;
  subGoals: number;
  tags: number;
  hasBlockingLinks: boolean;
}

export interface DeleteGoalDialogProps {
  open: boolean;
  goalId: string | null;
  goalTitle: string;
  onClose: () => void;
  onArchived: () => void;
  onDeleted: () => void;
}

export function DeleteGoalDialog({
  open,
  goalId,
  goalTitle,
  onClose,
  onArchived,
  onDeleted,
}: DeleteGoalDialogProps) {
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'archive' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !goalId) {
      setImpact(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    apiRequest<DeleteImpact>(`/api/goals/${goalId}`, { query: { impact: true } })
      .then((data) => {
        if (!cancelled) setImpact(data);
      })
      .catch((err: unknown) => {
        // The dialog must still work without the preview — deleting a goal with
        // nothing attached is the common case, and refusing to open because a
        // count query failed would be a worse bug than the one being fixed.
        if (!cancelled) {
          setImpact(null);
          setError(
            err instanceof Error ? err.message : 'Could not work out what this will remove'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, goalId]);

  const archive = async () => {
    if (!goalId || busy) return;
    setBusy('archive');
    setError(null);
    try {
      await apiRequest(`/api/goals/${goalId}`, {
        method: 'PUT',
        body: { status: 'CANCELLED' },
      });
      onArchived();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive this goal');
    } finally {
      setBusy(null);
    }
  };

  const destroy = async () => {
    if (!goalId || busy) return;
    setBusy('delete');
    setError(null);
    try {
      await apiRequest(`/api/goals/${goalId}`, { method: 'DELETE' });
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this goal');
    } finally {
      setBusy(null);
    }
  };

  const destroyed = impact
    ? [
        ['progress entries', impact.progressLogs],
        ['milestones', impact.milestones],
        ['tags', impact.tags],
        ['sub-goals', impact.subGoals],
      ].filter(([, count]) => (count as number) > 0)
    : [];

  const unlinked = impact
    ? [
        ['tasks', impact.tasks],
        ['time entries', impact.timeEntries],
      ].filter(([, count]) => (count as number) > 0)
    : [];

  return (
    <Modal isOpen={open} onClose={onClose} title={`Archive or delete "${goalTitle}"`}>
      <div className="space-y-5 pb-2">
        {/*
          Archive leads, and it is the button the eye lands on. Cancelling a goal
          keeps every progress row, milestone and streak; the only thing lost is
          the ability to tick it off. Deleting is destructive and irreversible, so
          it is the quiet button at the bottom.
        */}
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-start gap-3">
            <Archive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">Archive it</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Stops the clock, hides it from the active lists, and keeps the whole
                progress history. You can bring it back at any time.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={archive}
            isLoading={busy === 'archive'}
            disabled={busy !== null}
            className="mt-3 w-full"
          >
            Archive
          </Button>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">Delete permanently</h3>

              {loading ? (
                <p className="mt-1 text-xs text-muted-foreground">Checking what this removes…</p>
              ) : impact ? (
                <>
                  {destroyed.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Gone for good:</span>{' '}
                      {destroyed
                        .map(([label, count]) => `${count} ${label}`)
                        .join(', ')}
                      .
                    </p>
                  )}
                  {/*
                    The asymmetry, stated plainly. Tasks and time entries survive
                    the delete and only lose their link to this goal — which is a
                    materially gentler outcome than "cascades", and the user is
                    entitled to read it rather than infer it.
                  */}
                  {unlinked.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Kept, unlinked:</span>{' '}
                      {unlinked
                        .map(([label, count]) => `${count} ${label}`)
                        .join(', ')}
                      . They stay in your lists without a goal.
                    </p>
                  )}
                  {destroyed.length === 0 && unlinked.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nothing is attached to this goal yet.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {error
                    ? 'Could not work out exactly what this removes — deleting still works.'
                    : 'Everything attached to this goal is removed. This cannot be undone.'}
                </p>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={destroy}
            isLoading={busy === 'delete'}
            disabled={busy !== null}
            className="mt-3 w-full text-destructive hover:bg-destructive/10"
          >
            Delete permanently
          </Button>
        </div>

        {error && busy === null && impact && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button variant="ghost" onClick={onClose} disabled={busy !== null} className="w-full">
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

export default DeleteGoalDialog;