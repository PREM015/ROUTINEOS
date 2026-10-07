'use client';

/**
 * ModeSwitch — the four timer modes as a proper tablist.
 *
 * The old version was four buttons with `role="tab"` and no `tabpanel`, no
 * `aria-controls` and no arrow-key handling — announced as tabs, operated as
 * buttons. Screen-reader users navigating by tab would find four stops and no way
 * to move between them with the arrow keys that the role promises.
 *
 * This implements the actual pattern: roving `tabindex`, arrow keys (plus
 * Home/End), `aria-controls` pointing at the panel it switches, and a real
 * `tabpanel` in the page.
 */

import { useCallback, useRef } from 'react';
import { Coffee, Flag, Hourglass, Timer as TimerIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { FOCUS_MODES, type FocusMode } from '@/lib/focus/type-backfill';
import { getFocusRuntime, useFocusStore, isLive } from '@/store/focus.store';

interface ModeMeta {
  label: string;
  icon: LucideIcon;
  /** Panel id, so `aria-controls` and `tabpanel` agree. */
  panelId: string;
}

export const MODE_META: Record<FocusMode, ModeMeta> = {
  focus: { label: 'Focus', icon: TimerIcon, panelId: 'focus-panel-focus' },
  'short-break': { label: 'Short break', icon: Coffee, panelId: 'focus-panel-short-break' },
  'long-break': { label: 'Long break', icon: Flag, panelId: 'focus-panel-long-break' },
  stopwatch: { label: 'Stopwatch', icon: Hourglass, panelId: 'focus-panel-stopwatch' },
};

export const MODE_PANEL_ID = MODE_META.focus.panelId;

/**
 * Per-mode selected-state classes.
 *
 * Each mode has a domain accent. A plain white active-tab chip reads
 * as neutral and does not communicate which mode is running. The accent
 * colour makes the current mode legible at a glance without reading the
 * label, which is especially useful when the tab row is the first thing
 * you see on returning to the page mid-session.
 */
const MODE_ACTIVE_CLASSES: Record<FocusMode, string> = {
  focus:
    'bg-accent-focus/10 text-accent-focus ring-1 ring-accent-focus/30 shadow-[0_2px_10px_rgba(var(--accent-focus-rgb,225,29,72),0.12)] scale-105',
  'short-break':
    'bg-accent-habits/10 text-accent-habits ring-1 ring-accent-habits/30 shadow-[0_2px_8px_rgba(var(--accent-habits-rgb,5,150,105),0.10)] scale-105',
  'long-break':
    'bg-accent-habits/10 text-accent-habits ring-1 ring-accent-habits/30 shadow-[0_2px_8px_rgba(var(--accent-habits-rgb,5,150,105),0.10)] scale-105',
  stopwatch:
    'bg-background text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.08)] ring-1 ring-border/50 scale-105',
};

export function ModeSwitch({ className }: { className?: string }) {
  const mode = useFocusStore((s) => s.mode);
  const status = useFocusStore((s) => s.status);
  const busy = useFocusStore((s) => s.busy);
  const setMode = useFocusStore((s) => s.adopt);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Switching during a live run asks first.
   *
   * The old `switchMode` silently recorded the running session as stopped and
   * reset. That is a destructive action taken by a click the user reasonably
   * expected to just change the view, and it is the reason a stray tab-click used
   * to cost them a pomodoro.
   */
  const choose = useCallback(
    (next: FocusMode) => {
      if (next === mode) return;
      if (isLive(status)) {
        const proceed = window.confirm(
          `A ${MODE_META[mode].label.toLowerCase()} session is running. End it and switch to ${MODE_META[next].label.toLowerCase()}?`
        );
        if (!proceed) return;
        void getFocusRuntime()?.stop('MODE_SWITCHED');
      }
      setMode({ mode: next, error: null });
    },
    [mode, status, setMode]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const index = FOCUS_MODES.indexOf(mode);
      let next: number | null = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % FOCUS_MODES.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
        next = (index - 1 + FOCUS_MODES.length) % FOCUS_MODES.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = FOCUS_MODES.length - 1;
      if (next === null) return;

      event.preventDefault();
      const target = FOCUS_MODES[next];
      if (!target) return;
      choose(target);
      // Move focus with the selection, which is what roving tabindex means; without
      // this the arrow keys change the mode but leave focus on the old tab.
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[next]?.focus();
    },
    [mode, choose]
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Timer mode"
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-border bg-muted/40 p-1',
        className
      )}
    >
      {FOCUS_MODES.map((item) => {
        const meta = MODE_META[item];
        const Icon = meta.icon;
        const selected = item === mode;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            id={`focus-tab-${item}`}
            aria-selected={selected}
            aria-controls={meta.panelId}
            // Roving tabindex: exactly one tab is in the page's tab order.
            tabIndex={selected ? 0 : -1}
            disabled={busy}
            onClick={() => choose(item)}
            className={cn(
              'tap-target inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all duration-300 ease-out-expo',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:opacity-50',
              selected
                ? MODE_ACTIVE_CLASSES[item]
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export default ModeSwitch;
