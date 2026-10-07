'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { HelpCircle, History, Maximize2, Minimize2 } from 'lucide-react';

import { TimerDial } from '@/components/focus/TimerDial';
import { ModeSwitch, MODE_PANEL_ID } from '@/components/focus/ModeSwitch';
import { IntentRow } from '@/components/focus/IntentRow';
import { ContextRail } from '@/components/focus/ContextRail';
import { RoutineContextCard } from '@/components/focus/RoutineContextCard';
import { Transport } from '@/components/focus/Transport';
import { ReflectionStrip } from '@/components/focus/ReflectionStrip';
import { ShortcutsDialog } from '@/components/focus/ShortcutsDialog';
import { useFocusShortcuts } from '@/components/focus/useFocusShortcuts';
import { DistractionCapture, FocusLockMode } from '@/components/focus/distraction-capture';
import { FocusTodaySummary } from '@/components/focus/FocusTodaySummary';
import { NextActionSuggestion } from '@/components/focus/NextActionSuggestion';
import { RoutineDriftDisplay } from '@/components/focus/RoutineDriftDisplay';

import { getFocusRuntime, useFocusStore, isLive } from '@/store/focus.store';
import type { FocusMode } from '@/lib/focus/type-backfill';

/**
 * The drawer is code-split.
 *
 * It pulls in the history table, the filters, the detail sheet and the stats panel —
 * none of which are needed to run a timer, and all of which were previously in the
 * initial bundle for a page whose primary action is pressing Start. `ssr: false`
 * because it renders inside a Radix portal that measures the viewport, so a server
 * render would produce markup the client immediately discards.
 */
const SessionsDrawer = dynamic(
  () => import('@/components/focus/SessionsDrawer').then((m) => m.SessionsDrawer),
  { ssr: false }
);

/**
 * `/focus` — the stage.
 *
 * Composition only. The page used to lay out `FlipClock` beside a 1,506-line
 * `FocusTimer` that owned the timer state, the settings, the session POSTs and the
 * history fetch. All of that now lives in `FocusRuntime` (mounted in the dashboard
 * layout, because a runtime owned by a page dies with the page) and in the store.
 *
 * `FlipClock` is gone rather than demoted. It ran its own second-aligned interval
 * to show a wall clock, competing for the page's attention with the thing the page
 * is for, and its 3D flip is exactly the movement that pulls focus.
 */
export default function FocusPage() {
  const mode = useFocusStore((s) => s.mode);
  const status = useFocusStore((s) => s.status);
  const cycles = useFocusStore((s) => s.cycles);

  /**
   * `?panel=sessions|stats` opens the drawer on a given tab.
   *
   * Read from the URL rather than passed through a store so the command palette can
   * deep-link into the drawer without knowing anything about this component's state.
   * `useSearchParams` is wrapped in a Suspense boundary by the parent layout, which is
   * why this is read here rather than at the top level of the route.
   */
  const searchParams = useSearchParams();
  const panel = searchParams.get('panel');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<'sessions' | 'stats'>('sessions');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [zen, setZen] = useState(false);

  useEffect(() => {
    if (panel === 'sessions' || panel === 'stats') {
      setDrawerOpen(true);
      setInitialTab(panel);
    }
  }, [panel]);

  const toggle = useCallback(() => {
    const runtime = getFocusRuntime();
    if (!runtime) return;
    const store = useFocusStore.getState();
    if (store.status === 'running') void runtime.pause();
    else if (store.status === 'paused') void runtime.resume();
    else void runtime.start();
  }, []);

  useFocusShortcuts({
    onToggle: toggle,
    onReset: () => void getFocusRuntime()?.reset(),
    onSkip: () => {
      const runtime = getFocusRuntime();
      if (runtime && isLive(useFocusStore.getState().status)) {
        void runtime.stop('SKIPPED');
      }
    },
    onLap: () => {
      // A lap is a display concern, not a lifecycle event, so it is not written to
      // the event log. Stopwatch-only, mirroring the button.
      if (useFocusStore.getState().mode === 'stopwatch') return;
    },
    onExtend: () => void getFocusRuntime()?.extend(300),
    onMode: (next: FocusMode) => useFocusStore.getState().adopt({ mode: next }),
    onZen: () => setZen((prev) => !prev),
    onHelp: () => setShortcutsOpen(true),
  });

  return (
    <FocusLockMode>
      <div
        className="relative mx-auto w-full max-w-2xl px-4 py-8 transition-[max-width] duration-300 sm:py-12"
      >
        <div
          className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-40"
          aria-hidden="true"
        />
        <div className="noise-overlay pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

        {/*
          Zen mode drops the header and the intent row, leaving the dial and its
          controls. It is a visibility reduction rather than a fullscreen takeover on
          purpose: `requestFullscreen` needs a gesture, blocks on some mobile
          browsers, and exits unexpectedly on tab switch. Reducing what is on screen
          achieves the same thing without a permission prompt or a trap.
        */}
        {!zen && (
          <header className="mb-6 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-700 ease-out-expo">
            <h1 className="font-display text-2xl font-bold tracking-tight bg-gradient-to-br from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
              Focus
            </h1>
            <div className="flex items-center gap-1">
              <IconAction
                label="Session history and stats"
                onClick={() => setDrawerOpen(true)}
              >
                <History className="h-4 w-4" aria-hidden="true" />
              </IconAction>
              <IconAction
                label={zen ? 'Exit zen mode' : 'Zen mode'}
                onClick={() => setZen(true)}
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </IconAction>
              <IconAction label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
              </IconAction>
            </div>
          </header>
        )}

        {zen && (
          <>
            {/*
              Zen mode hides the visible header, which would leave the page with no
              `<h1>` at all. A screen-reader user toggling zen would land in a document
              with no top-level heading — so the heading stays in the accessibility
              tree and only its visual presentation is removed.
            */}
            <h1 className="sr-only">Focus — zen mode</h1>
            <div className="mb-4 flex justify-end">
              <IconAction label="Exit zen mode" onClick={() => setZen(false)}>
                <Minimize2 className="h-4 w-4" aria-hidden="true" />
              </IconAction>
            </div>
          </>
        )}

        <div className="flex flex-col items-center gap-6">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out-expo delay-150 fill-mode-both">
            <ModeSwitch />
          </div>

          {/*
            The panel the tablist points at. `aria-labelledby` names the active tab,
            so the mode is announced with the region — the pairing `aria-controls`
            promises and the old markup never provided.

            `--glass-hue` is set to `--accent-focus` (rose) so the glassmorphism
            material reflects the Focus domain rather than the default primary green.
            `data-live` drives the `focus-panel-live` breathing animation purely from
            CSS — no interval, no React re-render per tick.
          */}
          <div
            role="tabpanel"
            id={MODE_PANEL_ID}
            aria-labelledby={`focus-tab-${mode}`}
            data-live={
              status === 'running' ? 'true' : status === 'paused' ? 'paused' : 'idle'
            }
            className="glass-panel glass-panel-lift spotlight-hover focus-panel-live flex w-full flex-col items-center gap-8 rounded-2xl p-6 shadow-soft sm:p-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 ease-out-expo delay-200 fill-mode-both group"
            style={{ ['--glass-hue' as string]: 'var(--accent-focus)' }}
          >
            <TimerDial />
            <Transport />
          </div>

          {!zen && (
            <div className="flex w-full flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out-expo delay-300 fill-mode-both">
              <IntentRow />
              {/*
                Routine context: shows what block is active/up next and allows
                one-click pre-fill. Rendered after IntentRow so it supplements
                rather than replaces the manual intent input. Hidden during live
                sessions (RoutineContextCard's own guard).
              */}
              <RoutineContextCard />
              {/* Routine drift display: shows actual vs scheduled timing */}
              <RoutineDriftDisplay />
              {/* Above the reflection strip: what you are working on is an input to the
                  session, so it belongs next to the intent field rather than below the
                  summary of what happened. */}
              <ContextRail />
              {/* Keyed on the cycle count: a new finished block remounts the strip with
                  an empty rating, rather than resetting it in an effect. */}
              <ReflectionStrip key={cycles} resetKey={cycles} />
              {/* Today's Focus Summary with real stats */}
              <FocusTodaySummary />
              {/* Next action suggestion after completion */}
              <NextActionSuggestion />
            </div>
          )}

          <DistractionCapture />
        </div>

        <SessionsDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          initialTab={initialTab}
        />
        <ShortcutsDialog
          open={shortcutsOpen}
          onOpenChange={setShortcutsOpen}
          status={status}
          mode={mode}
        />
      </div>
    </FocusLockMode>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      // `tap-target` because the 36px visual box is under the 44px minimum; the
      // class expands the hit area without inflating the icon button.
      className="tap-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}