'use client';

/**
 * IntentRow — "what are you working on?", plus duration presets.
 *
 * Optional by design. Pressing Start with this empty must work, because a focus
 * tool that asks for paperwork before it will start a timer is a focus tool people
 * stop using. So nothing here blocks, and nothing here is required.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useFocusStore } from '@/store/focus.store';

/**
 * Duration shortcuts, anchored on the user's configured block length.
 *
 * These used to be a fixed `[15, 25, 45, 60]`, so for anyone who had set a 50-minute
 * block the chips offered four numbers and *not* the one they had configured - the
 * current length showed as unselected, and 25 appeared even though 25 meant nothing to
 * them.
 *
 * Now the configured length is always offered, with round alternatives around it and
 * the set trimmed to four. Duplicates are removed, so a 60-minute block does not render
 * two identical 60 chips.
 */
function durationPresets(configuredMinutes: number): number[] {
  const round = [15, 25, 45, 60, 90];
  const candidates = [configuredMinutes, ...round];
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const value of candidates) {
    if (value < MIN_MINUTES || value > MAX_MINUTES) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered.slice(0, 4);
}
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;

export function IntentRow({ className }: { className?: string }) {
  const intent = useFocusStore((s) => s.intent);
  const plannedMs = useFocusStore((s) => s.plannedMs);
  const mode = useFocusStore((s) => s.mode);
  const status = useFocusStore((s) => s.status);
  const adopt = useFocusStore((s) => s.adopt);

  const isStopwatch = mode === 'stopwatch';
  const live = status === 'running' || status === 'paused';
  const minutes = Math.round(plannedMs / 60_000);

  const setMinutes = useCallback(
    (next: number) => {
      // Applied immediately when idle, and deliberately ignored while running:
      // changing the deadline mid-session would silently extend or truncate it.
      if (live) {
        toast('Applies to the next session');
        return;
      }
      adopt({ plannedMs: next * 60_000 });
    },
    [live, adopt]
  );

  const onCustom = useCallback(
    (raw: string) => {
      const parsed = Number(raw);
      if (raw.trim() === '') return;
      if (!Number.isInteger(parsed) || parsed < MIN_MINUTES || parsed > MAX_MINUTES) {
        toast.error(`Choose between ${MIN_MINUTES} and ${MAX_MINUTES} minutes`);
        return;
      }
      setMinutes(parsed);
    },
    [setMinutes]
  );

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <label className="w-full max-w-sm">
        <span className="sr-only">What are you working on?</span>
        <input
          type="text"
          value={intent}
          maxLength={200}
          placeholder="What are you working on?"
          onChange={(event) => adopt({ intent: event.target.value })}
          className="w-full rounded-full border border-border bg-background/60 px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>

      {!isStopwatch && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {durationPresets(minutes).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setMinutes(preset)}
              aria-pressed={minutes === preset}
              aria-label={`Set duration to ${preset} minutes`}
              className={cn(
                'tap-target min-h-9 rounded-full border px-3 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                minutes === preset
                  ? 'border-transparent bg-accent-focus text-white'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {preset}m
            </button>
          ))}
          <label className="sr-only" htmlFor="focus-custom-minutes">
            Custom minutes
          </label>
          <input
            id="focus-custom-minutes"
            type="number"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            placeholder="min"
            onBlur={(event) => onCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onCustom((event.target as HTMLInputElement).value);
            }}
            className="tap-target h-9 w-20 rounded-full border border-border bg-background/60 px-3 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      )}
    </div>
  );
}

export default IntentRow;
