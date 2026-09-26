'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Coffee, Flag, Hourglass, Pause, Play, Square, Timer as TimerIcon, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFocusStore, type FocusMode } from '@/store/focus.store';

const MODE_META: Record<FocusMode, { label: string; color: string; icon: LucideIcon }> = {
  focus: { label: 'Focus', color: '#3b82f6', icon: TimerIcon },
  'short-break': { label: 'Short break', color: '#22c55e', icon: Coffee },
  'long-break': { label: 'Long break', color: '#8b5cf6', icon: Flag },
  stopwatch: { label: 'Stopwatch', color: '#f59e0b', icon: Hourglass },
};

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * FloatingFocusBar — a persistent mini timer pinned to the corner of the
 * dashboard while a focus session is running or paused. State comes from the
 * global focus store (pushed by <FocusTimer/>), so it stays in sync anywhere
 * in the app; countdown values are derived from the absolute `endsAt`
 * timestamp, never decremented, so throttled tabs cannot drift it.
 */
export function FloatingFocusBar() {
  const status = useFocusStore((s) => s.status);
  const mode = useFocusStore((s) => s.mode);
  const endsAt = useFocusStore((s) => s.endsAt);
  const remainingMs = useFocusStore((s) => s.remainingMs);
  const plannedMs = useFocusStore((s) => s.plannedMs);
  const swAccumMs = useFocusStore((s) => s.swAccumMs);
  const swRunStart = useFocusStore((s) => s.swRunStart);
  const cycles = useFocusStore((s) => s.cycles);
  const collapsed = useFocusStore((s) => s.collapsed);
  const toggleCollapsed = useFocusStore((s) => s.toggleCollapsed);
  const pause = useFocusStore((s) => s.pause);
  const resume = useFocusStore((s) => s.resume);
  const stop = useFocusStore((s) => s.stop);

  const [now, setNow] = useState(() => Date.now());

  const visible = status === 'running' || status === 'paused';

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  const meta = MODE_META[mode];
  const Icon = meta.icon;

  const remaining =
    mode === 'stopwatch'
      ? swAccumMs + (status === 'running' && swRunStart !== null ? Math.max(0, now - swRunStart) : 0)
      : status === 'running' && endsAt !== null
        ? Math.max(0, endsAt - now)
        : remainingMs;

  const countdown = mode !== 'stopwatch';
  const progress = countdown
    ? plannedMs > 0
      ? Math.min(1, Math.max(0, 1 - remaining / plannedMs))
      : 0
    : 0;

  const statusLabel = status === 'paused' ? 'Paused' : meta.label;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${meta.label} timer, ${formatTime(remaining)}${status === 'paused' ? ', paused' : ''}`}
      className="fixed bottom-20 right-3 z-40 md:bottom-6 md:right-6"
    >
      {collapsed ? (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="glass-panel flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2.5 shadow-soft transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Expand ${meta.label} timer — ${formatTime(remaining)}`}
        >
          <span className="relative flex h-2.5 w-2.5">
            {status === 'running' && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ backgroundColor: meta.color }}
              />
            )}
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{formatTime(remaining)}</span>
        </button>
      ) : (
        <div className="glass-panel w-72 rounded-2xl border border-border p-4 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex rounded-lg p-1.5"
                style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{statusLabel}</p>
                {countdown && cycles > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {cycles} {cycles === 1 ? 'pomodoro' : 'pomodoros'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/focus/session"
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Open the full focus timer"
              >
                Open
              </Link>
              <button
                type="button"
                onClick={toggleCollapsed}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Collapse timer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="font-mono text-3xl font-bold tabular-nums text-foreground">{formatTime(remaining)}</p>
            <div className="flex items-center gap-1.5">
              {status === 'running' ? (
                <button
                  type="button"
                  onClick={pause}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Pause timer"
                >
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resume}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-500 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  aria-label="Resume timer"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Resume
                </button>
              )}
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                aria-label="Stop timer and reset"
              >
                <Square className="h-3 w-3" aria-hidden="true" />
                Stop
              </button>
            </div>
          </div>

          {countdown && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: meta.color }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}