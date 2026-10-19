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

/**
 * Rating options: emoji as the primary affordance, number as the value.
 *
 * Emoji communicate session quality faster than numbers: "how did that feel"
 * has an obvious mapping to a face, not to 3.4 out of 5. The numeric value
 * sent to the server is unchanged.
 *
 * Five levels because five is the conventional scale and two extremes plus a
 * middle is not enough granularity for reflection to be useful.
 */
const RATINGS: ReadonlyArray<{ value: number; emoji: string; label: string }> = [
  { value: 1, emoji: '😔', label: 'Struggled' },
  { value: 2, emoji: '😤', label: 'Distracted' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '🔥', label: 'Deep flow' },
];

export function ReflectionStrip({ resetKey }: { resetKey: number }) {
  const status = useFocusStore((s) => s.status);
  const cycles = useFocusStore((s) => s.cycles);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const sessionEnded = status === 'finished';
  // Show after any completed focus session, regardless of which mode tab is active.
  // The old condition `inBreak && mode !== 'focus'` meant the reflection never appeared
  // when the user finished a session but stayed on the Focus tab — which is the common path.
  const visible = sessionEnded && cycles > 0 && !dismissed;

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
      className="border-accent-focus/20 from-accent-focus/5 via-card to-accent-goals/5 w-full rounded-[1.75rem] border bg-gradient-to-br p-5 shadow-sm sm:p-6"
      style={{ ['--glass-hue' as string]: 'var(--accent-focus)' }}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reflection-strip-heading" className="text-foreground text-base font-semibold">
          How did that go?
        </h2>
        <div className="flex items-center gap-2">
          {/* A thin 20-second countdown bar so the user knows they have time,
              without a visible timer that would create urgency. */}
          <div className="bg-border h-1 w-16 overflow-hidden rounded-full" aria-hidden="true">
            <div className="toast-progress bg-accent-focus/60 h-full rounded-full" />
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-primary rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            Skip
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* Emoji rating buttons — faster to parse than plain numbers */}
        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">Focus rating, 1 to 5</legend>
          {RATINGS.map(({ value, emoji, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(rating === value ? null : value)}
              aria-pressed={rating === value}
              aria-label={`${label} (${value} out of 5)`}
              title={label}
              className={cn(
                'tap-target ease-out-expo flex h-12 w-12 flex-col items-center justify-center rounded-2xl border text-lg transition-all duration-200',
                'focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                rating === value
                  ? 'border-accent-focus/40 bg-accent-focus/10 scale-110 shadow-md'
                  : 'border-border/70 bg-card/70 text-muted-foreground hover:border-accent-goals/40 hover:bg-accent-goals/10 hover:scale-105',
              )}
            >
              <span aria-hidden="true">{emoji}</span>
              <span className="sr-only">{label}</span>
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
            className="border-border bg-background/60 focus-visible:ring-primary h-10 w-full rounded-full border px-4 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </label>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={rating === null && note.trim() === ''}
          className="tap-target bg-accent-focus focus-visible:ring-accent-focus h-10 rounded-full px-4 text-sm font-medium text-white transition-all duration-200 hover:scale-105 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {/* Selected rating label — shows the word for the chosen emoji so the
          user gets confirmation of what they picked. */}
      {rating !== null && (
        <p className="text-muted-foreground mt-2 text-xs">
          {RATINGS.find((r) => r.value === rating)?.label} &mdash; saved with your session.
        </p>
      )}
    </section>
  );
}

export default ReflectionStrip;
