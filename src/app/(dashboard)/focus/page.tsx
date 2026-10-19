'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, HelpCircle, History, Maximize2, Minimize2, Sparkles } from 'lucide-react';

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
import { FocusWorldClock } from '@/components/focus/FocusWorldClock';
import { NextActionSuggestion } from '@/components/focus/NextActionSuggestion';
import { RoutineDriftDisplay } from '@/components/focus/RoutineDriftDisplay';

import { getFocusRuntime, useFocusStore, isLive } from '@/store/focus.store';
import type { FocusMode } from '@/lib/focus/type-backfill';

import styles from './focus-studio.module.css';

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
  { ssr: false },
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
        className={`${styles.studio} relative mx-auto w-full max-w-7xl px-4 py-7 transition-[max-width] duration-300 sm:px-6 sm:py-10`}
      >
        {/*
          Zen mode drops the header and the intent row, leaving the dial and its
          controls. It is a visibility reduction rather than a fullscreen takeover on
          purpose: `requestFullscreen` needs a gesture, blocks on some mobile
          browsers, and exits unexpectedly on tab switch. Reducing what is on screen
          achieves the same thing without a permission prompt or a trap.
        */}
        {!zen && (
          <header className="animate-in fade-in slide-in-from-top-4 ease-out-expo mb-8 flex flex-col gap-5 duration-700 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="border-accent-goals/25 bg-accent-goals/10 text-accent-goals mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Your Focus Studio
              </p>
              <h1 className="font-display from-accent-focus via-accent-streak to-accent-insights bg-gradient-to-r bg-clip-text text-4xl font-extrabold leading-tight tracking-tight text-transparent sm:text-5xl">
                Make room for flow.
              </h1>
              <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed sm:text-base">
                One clear intention. One focused block. Let&apos;s make it count.
              </p>
            </div>
            <div className="border-border/70 bg-card/75 flex items-center gap-2 self-start rounded-2xl border p-1.5 shadow-sm backdrop-blur-xl sm:self-auto">
              <IconAction label="Session history and stats" onClick={() => setDrawerOpen(true)}>
                <History className="h-4 w-4" aria-hidden="true" />
              </IconAction>
              <IconAction label={zen ? 'Exit zen mode' : 'Zen mode'} onClick={() => setZen(true)}>
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

        <div
          className={`grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)] xl:gap-8 ${zen ? 'mx-auto max-w-3xl grid-cols-1' : ''}`}
        >
          <section className="min-w-0 space-y-5">
            <div className="animate-in fade-in slide-in-from-bottom-4 ease-out-expo fill-mode-both flex flex-col gap-3 delay-150 duration-700 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-muted-foreground text-[0.68rem] font-bold uppercase tracking-[0.2em]">
                  Session control
                </p>
                <h2 className="text-foreground mt-1 text-lg font-semibold tracking-tight">
                  Choose your rhythm
                </h2>
              </div>
              <ModeSwitch />
            </div>

            {/*
              The panel the tablist points at. `aria-labelledby` names the active tab,
              and the persistent runtime/store continue to own all session behavior.
            */}
            <div
              role="tabpanel"
              id={MODE_PANEL_ID}
              aria-labelledby={`focus-tab-${mode}`}
              data-live={status === 'running' ? 'true' : status === 'paused' ? 'paused' : 'idle'}
              className={`${styles.timerPanel} focus-panel-live animate-in fade-in slide-in-from-bottom-6 ease-out-expo fill-mode-both flex w-full flex-col items-center gap-5 rounded-[2rem] p-5 delay-200 duration-1000 sm:gap-7 sm:p-8`}
              style={{ ['--glass-hue' as string]: 'var(--accent-focus)' }}
            >
              <div className="relative z-10 flex w-full items-center justify-between gap-4">
                <div>
                  <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">
                    Your next block
                  </p>
                  <p className="text-foreground mt-1 text-sm font-medium">
                    Give this moment your full attention
                  </p>
                </div>
                {status === 'running' && (
                  <span className="border-accent-focus/20 bg-accent-focus/10 text-accent-focus inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
                    <span
                      className="bg-accent-focus h-2 w-2 animate-pulse rounded-full"
                      aria-hidden="true"
                    />
                    {mode === 'focus'
                      ? 'In flow'
                      : mode === 'stopwatch'
                        ? 'Time running'
                        : 'On a break'}
                  </span>
                )}
              </div>
              <TimerDial className="relative z-10 w-full" />
              <div className="relative z-10 w-full">
                <Transport />
              </div>
            </div>

            {!zen && (
              <div className="border-border/70 bg-card/80 animate-in fade-in slide-in-from-bottom-8 ease-out-expo fill-mode-both rounded-[1.75rem] border p-5 shadow-sm backdrop-blur-xl delay-300 duration-1000 sm:p-6">
                <div className="mb-4 flex items-start gap-3">
                  <span className="bg-accent-insights/10 text-accent-insights inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                    <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-foreground text-base font-semibold">Set your intention</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Make the next session yours. No setup required.
                    </p>
                  </div>
                </div>
                <IntentRow />
              </div>
            )}

            {!zen && <ReflectionStrip key={cycles} resetKey={cycles} />}
          </section>

          {!zen && (
            <aside className="animate-in fade-in slide-in-from-right-4 ease-out-expo fill-mode-both min-w-0 space-y-5 delay-300 duration-1000">
              <FocusWorldClock />

              <section
                aria-labelledby="focus-today-heading"
                className="border-accent-insights/20 from-accent-insights/10 via-card to-accent-goals/10 relative overflow-hidden rounded-[1.75rem] border bg-gradient-to-br p-5 shadow-sm sm:p-6"
              >
                <div
                  className="bg-accent-insights/10 pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-2xl"
                  aria-hidden="true"
                />
                <div className="relative">
                  <p className="text-accent-insights text-[0.68rem] font-bold uppercase tracking-[0.2em]">
                    Today&apos;s momentum
                  </p>
                  <h2
                    id="focus-today-heading"
                    className="text-foreground mb-4 mt-1 text-lg font-semibold"
                  >
                    Your focus, adding up
                  </h2>
                  <FocusTodaySummary />
                </div>
              </section>

              <RoutineContextCard className="border-border/70 bg-card/80 rounded-[1.75rem] border p-5 shadow-sm backdrop-blur-xl sm:p-6" />
              <ContextRail className="border-border/70 bg-card/80 rounded-[1.75rem] border p-5 shadow-sm backdrop-blur-xl sm:p-6" />
              <NextActionSuggestion className="border-accent-goals/20 from-accent-goals/10 via-card to-accent-focus/5 !max-w-none rounded-[1.75rem] border bg-gradient-to-br p-5 shadow-sm sm:p-6" />
              <RoutineDriftDisplay className="border-border/70 bg-card/80 rounded-[1.75rem] border p-5 shadow-sm backdrop-blur-xl sm:p-6" />
            </aside>
          )}
        </div>

        <DistractionCapture />

        <SessionsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} initialTab={initialTab} />
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
      className="tap-target text-muted-foreground hover:bg-accent-focus/10 hover:text-accent-focus focus-visible:ring-accent-focus inline-flex h-11 w-11 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2"
    >
      {children}
    </button>
  );
}
