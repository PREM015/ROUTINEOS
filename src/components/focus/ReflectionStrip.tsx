'use client';

/**
 * ReflectionStrip — "how did that go?", asked in under five seconds.
 *
 * Appears during the break after a completed focus block. Everything about its
 * design follows from one rule: **it must be dismissible in one action, by
 * someone who does not want to answer.**
 *
 * That is why it is a strip rather than a modal, why it auto-dismisses, and why
 * nothing on it is required. A reflection prompt that blocks is a prompt people
 * learn to dismiss without reading, which costs the data and still costs the
 * interruption.
 *
 * The session is already saved by the time this appears — the rating is an
 * annotation on a finished row, not a precondition for finishing it.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { getFocusRuntime, useFocusStore } from '@/store/focus.store';

/** Auto-dismiss. Long enough to answer, short enough not to become a wall. */
const AUTO_DISMISS_MS = 20_000;

export function ReflectionStrip({ resetKey }: { resetKey: number }) {
  const status = useFocusStore((s) => s.status);
  const mode = useFocusStore((s) => s.mode);
  const cycles = useFocusStore((s) => s.cycles);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const sessionEnded = status === 'finished';
  const inBreak = mode !== 'focus';
  const visible = sessionEnded && inBreak && cycles > 0 && !dismissed;

  // `resetKey` is consumed by the parent's `key` prop, so a new cycle remounts this
  // strip with an empty rating. Doing it with an effect instead would mean a second
  // render pass on every transition, for state that is known-stale the moment it
  // is set.
  void resetKey;

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const submit = async () => {
    const runtime = getFocusRuntime();
    if (!runtime) {
      setDismissed(true);
      return;
    }
    try {
      await runtime.reflect({
        focusRating: rating ?? undefined,
        notes: note.trim() || undefined,
      });
      setDismissed(true);
    } catch {
      // A lost rating is not worth interrupting for. The session itself is saved.
      setDismissed(true);
      toast('Could not save the reflection', {
        description: 'The session is saved; only the rating was lost.',
      });
    }
  };

  return (
    <section
      aria-labelledby="reflection-strip-heading"
      className="glass-panel w-full rounded-2xl border border-border p-4 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reflection-strip-heading" className="text-sm font-medium text-foreground">
          How did that feel?
        </h2>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Skip
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Focus rating, 1 to 5</legend>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(rating === value ? null : value)}
              aria-pressed={rating === value}
              aria-label={`${value} out of 5`}
              className={cn(
                'tap-target h-10 w-10 rounded-lg border text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                rating === value
                  ? 'border-transparent bg-accent-focus text-white'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {value}
            </button>
          ))}
        </fieldset>

        <label className="min-w-40 flex-1">
          <span className="sr-only">A note about this session</span>
          <input
            type="text"
            value={note}
            maxLength={200}
            placeholder="Anything worth remembering? (optional)"
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            className="h-10 w-full rounded-full border border-border bg-background/60 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>

        <button
          type="button"
          onClick={() => void submit()}
          className="tap-target h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Save
        </button>
      </div>
    </section>
  );
}

export default ReflectionStrip;
