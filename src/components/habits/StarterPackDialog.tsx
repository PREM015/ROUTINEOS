'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertCircle, Check } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { fetchWithAuth } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { StarterPackPreview } from '@/types/habit';

/**
 * Preview and apply a starter pack.
 *
 * Grouped by tier, because that is the point of the pack: tier 1 starts today,
 * tier 2 and 3 start after the delay. Showing the resolved start date per group
 * is what turns "here is a list of 166 habits" into "here is your next 30
 * days".
 *
 * Habits already owned are listed but explicitly **not** going to be touched —
 * the preview says so before the user confirms, and the apply has no update path
 * to violate it. That is the difference between an onboarding flow that is safe
 * to re-run and one that resets what someone deliberately changed.
 */

interface StarterPackDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: (result: { created: number; skipped: number }) => void;
}

export function StarterPackDialog({
  open,
  onClose,
  onApplied,
}: StarterPackDialogProps) {
  const [preview, setPreview] = useState<StarterPackPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth('/api/starter-packs/preview', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(`Could not load the pack (status ${response.status})`);
      }
      const json = (await response.json()) as { data?: StarterPackPreview };
      setPreview(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the pack');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadPreview();
  }, [open, loadPreview]);

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      const response = await fetchWithAuth('/api/starter-packs/apply', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(json?.error ?? 'Could not apply the pack');
        return;
      }

      onApplied(json?.data ?? { created: 0, skipped: 0 });
      onClose();
    } catch {
      setError('Could not apply the pack. Check your connection and try again.');
    } finally {
      setApplying(false);
    }
  };

  const toCreate = preview?.grouped.reduce(
    (sum, group) =>
      sum + group.habits.filter((h) => !h.alreadyExists).length,
    0
  ) ?? 0;

  return (
    <Modal
      isOpen={open}
      onClose={applying ? () => undefined : onClose}
      title="Apply a starter pack"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={applying}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={apply}
            disabled={applying || loading || toCreate === 0}
          >
            {applying && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {toCreate === 0 ? 'Nothing to add' : `Add ${toCreate} habits`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A suggested set, grouped by tier. Tier 1 starts today; the rest start
          after the first month, so you are not adopting everything at once.
          <strong className="text-foreground"> Everything is editable afterwards</strong>,
          and anything you already have is left exactly as it is.
        </p>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building your preview…
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {preview && !loading && (
          <>
            {preview.skippedAsExisting > 0 && (
              <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                You already have {preview.skippedAsExisting} of these. They are
                shown below and will not be changed — your targets, tiers and
                history stay as they are.
              </p>
            )}

            <div className="space-y-4">
              {preview.grouped.map((group) => (
                <section key={group.tier}>
                  <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-semibold text-foreground">
                    {group.tier.replace(/_/g, ' ')}
                    <span className="text-xs font-normal text-muted-foreground">
                      {group.habits.filter((h) => !h.alreadyExists).length} new · starts{' '}
                      {group.habits[0]?.startDate ?? 'today'}
                    </span>
                  </h3>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {group.habits.map((habit) => (
                      <li
                        key={habit.name}
                        className={cn(
                          'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm',
                          habit.alreadyExists
                            ? 'border-primary/40 bg-primary/5 text-muted-foreground'
                            : 'border-border'
                        )}
                      >
                        {habit.alreadyExists && (
                          <Check
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              habit.alreadyExists && 'line-through opacity-70'
                            )}
                          >
                            {habit.name}
                          </span>
                          {habit.targetValue !== null && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {habit.targetValue.toLocaleString()}
                              {habit.unit ? ` ${habit.unit}` : ''}
                            </span>
                          )}
                          {habit.alreadyExists && (
                            <span className="ml-1 text-xs">(yours already)</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}