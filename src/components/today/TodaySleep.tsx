'use client';

import { useEffect, useRef, useState } from 'react';
import { Moon, BedDouble, Clock3, Timer } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { TimePickerModal } from '@/components/ui/TimePickerModal';
import { Mount } from '@/components/motion/Mount';
import { showNotification } from '@/lib/pwa/notifications';
import { notifyTodayDataChanged } from '@/lib/today-sync';
import {
  useSleepSession,
  type SleepLogView,
  type SleepPromptView,
} from '@/hooks/useSleepSession';
import { SleepQualityMeter } from '@/components/sleep/SleepQualityMeter';
import { GlassPanel } from '@/components/today/ui';
import { createPortal } from 'react-dom';
import {
  calculateSleepDuration,
  calculateSleepScore,
} from '@/lib/sleep/calculate-duration';

/**
 * Sleep Tracker
 * v2: auto-tracked sessions (start / stop) plus a per-day sleep prompt that
 * fires at the target bedtime and auto-starts after a timeout unless the user
 * responds "Not yet". Manual logging via /api/sleep remains as a fallback.
 */

interface TodaySleepProps {
  date: string;
}

export function TodaySleep({ date }: TodaySleepProps) {
  const {
    state,
    loading,
    busy,
    error,
    start,
    stop,
    respond,
    longRunning,
    refresh,
  } = useSleepSession();
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const notifiedReminder = useRef<Set<string>>(new Set());
  const notifiedPreWarning = useRef<Set<string>>(new Set());
  const [longRunningOpen, setLongRunningOpen] = useState(false);
  const [wakeConfirmOpen, setWakeConfirmOpen] = useState(false);
  const [wakeLaterOpen, setWakeLaterOpen] = useState(false);

  const active = state?.active ?? null;
  const prompt = state?.prompt ?? null;
  const preWarning = state?.preWarning ?? null;
  const wakePrompt = state?.wakePrompt ?? null;
  const todaySleepLog = state?.todaySleepLog ?? null;
  const hasLog = Boolean(todaySleepLog);

  // Surface the pending prompt once as a system notification.
  useEffect(() => {
    if (!prompt) return;
    if (notifiedReminder.current.has(prompt.id)) return;
    notifiedReminder.current.add(prompt.id);
    void showNotification('Time to sleep', {
      body: `Your target bedtime is ${prompt.targetBedtime || 'set'}. Sleep will start automatically in ${prompt.autoStartAfterMinutes} minutes unless you say "Not yet".`,
      tag: `sleep-prompt-${prompt.id}`,
    }).catch(() => undefined);
  }, [prompt]);

  // Surface pre-warning notification
  useEffect(() => {
    if (!preWarning) return;
    if (notifiedPreWarning.current.has(preWarning.id)) return;
    notifiedPreWarning.current.add(preWarning.id);
    void showNotification('Sleep schedule approaching', {
      body: `Your sleep schedule starts in 1 hour (at ${preWarning.targetBedtime}). Start winding down!`,
      tag: `sleep-pre-warning-${preWarning.id}`,
    }).catch(() => undefined);
  }, [preWarning]);

  // Wake prompt is handled via push notification actions, not shown as system notification here

  /**
   * "I woke up" must never end the session on its own.
   *
   * The click time is not a measurement. The button can be pressed hours after
   * waking because the alarm was ignored, or not pressed at all. Ending the
   * session here used to write the click timestamp straight into
   * `actualWakeTime`, which then drove the duration and `DailyScore.sleepScore`.
   *
   * So the button now only opens {@link WakeConfirmDialog}, which asks whether
   * the scheduled bedtime is right and then takes the real wake time.
   */
  const handleStop = () => {
    // A session over 16h gets one extra confirmation first â€” it is almost
    // certainly a forgotten session rather than a night. The service now
    // expires these on its own, but a live card should still say so plainly
    // rather than inviting a 17-hour entry.
    if (longRunning) {
      setLongRunningOpen(true);
      return;
    }
    setWakeConfirmOpen(true);
  };

  const confirmLongRunningStop = () => {
    setLongRunningOpen(false);
    setWakeConfirmOpen(true);
  };

  const handleWakeLater = (selectedTime: string) => {
    setWakeLaterOpen(false);
    // Use the selected time as wake time, bedtime from session start
    const sessionBedtime = active?.startedAt
      ? new Date(active.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : "";
    void stop({ bedtime: sessionBedtime, wakeTime: selectedTime }).then((ok) => {
      if (ok) setWakeConfirmOpen(false);
    });
  };

  const handleWakeAtTarget = () => {
    // Use target wake time from settings
    const targetWake = wakePrompt?.targetWakeTime || todaySleepLog?.targetWakeTime || "05:00";
    const sessionBedtime = active?.startedAt
      ? new Date(active.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : "";
    void stop({ bedtime: sessionBedtime, wakeTime: targetWake }).then((ok) => {
      if (ok) setWakeConfirmOpen(false);
    });
  };

  if (loading) {
    return (
      <GlassPanel accent="sleep" className="p-4 sm:p-5" aria-busy="true" aria-label="Loading sleep">
        <Skeleton shine className="mb-4 h-6 w-1/3" />
        <Skeleton className="h-20 w-full" />
      </GlassPanel>
    );
  }

  return (
    <Mount>
      <GlassPanel accent="sleep" className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Sleep</h3>
        {!active && !prompt && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => void start()}
              isLoading={busy === 'start'}
              disabled={hasLog}
            >
              Start sleep
            </Button>
            <Dialog open={isEditing} onOpenChange={setIsEditing}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  {hasLog ? 'Edit' : 'Log Sleep'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Log Sleep</DialogTitle>
                </DialogHeader>
                <SleepForm
                  onSave={async (formData) => {
                    setSaveError(null);
                    try {
                      const res = await fetch('/api/sleep', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date, ...formData }),
                      });

                      // Previously `if (res.ok)` with no `else`, and a `catch`
                      // whose entire body was a comment. A 400 (the form sends
                      // `quality: NaN` for a blank field) or a 500 left the
                      // dialog open, the fields untouched, and no message at
                      // all â€” the user just clicked Save again and again.
                      if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(
                          body?.error ?? `Could not save (status ${res.status})`
                        );
                      }

                      setIsEditing(false);
                      // Re-read through the store so both this card and
                      // SleepPromptHost see the new log. Previously this was a
                      // bare `fetch` whose Response was discarded, so the
                      // shared state was never updated and a rejection escaped
                      // as an unhandled promise.
                      await refresh();
                      notifyTodayDataChanged();
                    } catch (err) {
                      setSaveError(
                        err instanceof Error ? err.message : 'Could not save sleep log'
                      );
                    }
                  }}
                  initialData={todaySleepLog}
                  error={saveError}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {active ? (
        <ActiveTimer
          startedAt={active.startedAt}
          source={active.source}
          onStop={handleStop}
          busy={busy === 'stop'}
        />
      ) : prompt ? (
        <ReminderPanel
          prompt={prompt}
          onStartNow={() => void respond('YES')}
          onDismiss={() => void respond('NOT_YET')}
          busy={busy === 'respond'}
        />
      ) : preWarning ? (
        <PreWarningPanel
          preWarning={preWarning}
          onDismiss={() => {
            // Dismiss pre-warning - just clear it from view
            // The server will handle the dismissal
          }}
          busy={busy === 'respond'}
        />
      ) : wakePrompt ? (
        <WakePromptPanel
          wakePrompt={wakePrompt}
          onWokeAtTarget={() => {
            // This is handled via push notification actions
            // The panel just shows the prompt is active
          }}
          onWokeLater={() => {
            // Open wake time picker
            setWakeConfirmOpen(true);
          }}
          onStillSleeping={() => {
            // Dismiss wake prompt, keep session running
          }}
          busy={busy === 'respond'}
        />
      ) : (
        <div>
          {hasLog ? (
            <SleepSummary
          log={todaySleepLog as SleepLogView}
          targetBedtime={(todaySleepLog as SleepLogView | null)?.targetBedtime}
          targetWakeTime={(todaySleepLog as SleepLogView | null)?.targetWakeTime}
        />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Moon className="mx-auto h-8 w-8 mb-2 opacity-60" />
              <p className="text-sm">No sleep logged yet today.</p>
              <p className="text-xs mt-1">
                Start a session or log it manually.
              </p>
            </div>
          )}
        </div>
      )}

      {/*
        Portalled for a real reason, not for tidiness.

        This used to be a hand-rolled `fixed inset-0` block rendered *inside* the
        card. `GlassPanel` sets `backdrop-filter` via `.glass-panel`, and a
        computed `backdrop-filter` other than `none` creates a **containing block
        for `position: fixed` descendants** â€” so `inset-0` resolved against the
        card instead of the viewport, and the card's `overflow-hidden` clipped it.
        The dialog appeared as a small box inside the sleep card with its buttons
        cut off. The old shared `Card` had no `backdrop-filter`, so this only
        appeared after the glass-shell migration.

        `createPortal(..., document.body)` escapes the containing block, and
        reusing the Radix `Dialog` (already imported for the log form) also brings
        a focus trap, Escape handling and focus restore, which the hand-rolled
        version lacked.
      */}
      {typeof document !== 'undefined' &&
        createPortal(
          <Dialog open={longRunningOpen} onOpenChange={setLongRunningOpen} size="sm">
            <DialogContent>
              <DialogTitle>Still sleeping?</DialogTitle>
              <p className="text-sm text-muted-foreground">
                This session has been running for over 16 hours, which is longer
                than a typical night. Did you forget to stop it?
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setLongRunningOpen(false)}>
                  Keep tracking
                </Button>
                <Button onClick={confirmLongRunningStop} isLoading={busy === 'stop'}>
                  Yes, end it
                </Button>
              </div>
            </DialogContent>
          </Dialog>,
          document.body
        )}
      </GlassPanel>
      {/*
        The wake dialog is portalled for the same reason as the "still
        sleeping?" dialog above â€” `GlassPanel` sets `backdrop-filter`, which
        makes it a containing block for `position: fixed`, and its
        `overflow-hidden` would clip an inline dialog to the card.
      */}
      {typeof document !== 'undefined' &&
        createPortal(
          wakeConfirmOpen ? (
            <WakeConfirmDialog
              onClose={() => setWakeConfirmOpen(false)}
              onConfirmAtTarget={handleWakeAtTarget}
              onConfirmLater={() => setWakeLaterOpen(true)}
              onStillSleeping={() => {
                // Dismiss wake prompt via API
                void fetch('/api/sleep/session/wake-confirm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ promptId: wakePrompt?.id, action: 'still-sleeping' }),
                }).catch(() => undefined);
                setWakeConfirmOpen(false);
              }}
              busy={busy === 'stop'}
              targetWakeTime={
                wakePrompt?.targetWakeTime || todaySleepLog?.targetWakeTime || null
              }
            />
          ) : null,
          document.body
        )}
      {typeof document !== 'undefined' &&
        createPortal(
          wakeLaterOpen ? (
            <TimePickerModal
              open={wakeLaterOpen}
              onClose={() => setWakeLaterOpen(false)}
              onConfirm={handleWakeLater}
              initialTime={wakePrompt?.targetWakeTime || todaySleepLog?.targetWakeTime || "05:00"}
              title="When did you wake up?"
              description="Select the actual time you woke up"
              timeFormat="24h"
              isLoading={busy === 'stop'}
            />
          ) : null,
          document.body
        )}
    </Mount>
  );
}

function ActiveTimer({
  startedAt,
  source,
  onStop,
  busy,
}: {
  startedAt: string;
  source: string | null;
  onStop: () => void;
  busy: boolean;
}) {
  const startedMs = Date.parse(startedAt);
  // eslint-disable-next-line react-hooks/purity -- live timer
  const elapsedMs = Math.max(0, Date.now() - startedMs);
  const elapsed = formatClock(elapsedMs);
  const startedLocal = new Date(startedMs).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Sleep session active
          </p>
          <p className="mt-1 text-3xl font-bold text-foreground tabular-nums">{elapsed}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Started at {startedLocal}
            {source === 'AUTO_NO_RESPONSE' && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                auto-started
              </span>
            )}
          </p>
        </div>
        <BedDouble className="h-10 w-10 text-emerald-500/60" />
      </div>
      <Button className="mt-4 w-full" onClick={onStop} isLoading={busy}>
        I woke up
      </Button>
    </div>
  );
}

/**
 * Confirms the two facts a sleep session cannot infer.
 *
 * The service is deliberately capable of proceeding without an answer (it falls
 * back to the session clock), so the *only* thing standing between a 09:00 button
 * press and a fabricated 09:00 wake time is this dialog being shown and
 * answered. It is rendered conditionally by the parent so it mounts fresh with
 * current defaults each time rather than keeping stale state.
 *
 * Three options:
 * - "Yes, at target time" → uses target wake time
 * - "I woke up later" → opens TimePickerModal for actual wake time
 * - "Still sleeping" → dismisses prompt, keeps session running
 */
function WakeConfirmDialog({
  onClose,
  onConfirmAtTarget,
  onConfirmLater,
  onStillSleeping,
  busy,
  targetWakeTime,
}: {
  onClose: () => void;
  onConfirmAtTarget: () => void;
  onConfirmLater: () => void;
  onStillSleeping: () => void;
  busy: boolean;
  /** Target wake time from settings, used as the wake prefill. */
  targetWakeTime?: string | null;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm your wake time</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-1">
          <p className="text-sm text-muted-foreground">
            Your target wake time is{' '}
            <span className="font-semibold text-foreground">{targetWakeTime || 'not set'}</span>.
            When did you actually wake up?
          </p>

          <div className="space-y-2">
            <Button
              onClick={onConfirmAtTarget}
              isLoading={busy}
              className="w-full justify-start"
            >
              <span className="mr-2">✓</span>
              Yes, I woke up at {targetWakeTime || 'target time'}
            </Button>

            <Button
              variant="outline"
              onClick={onConfirmLater}
              isLoading={busy}
              className="w-full justify-start"
            >
              <span className="mr-2">🕐</span>
              I woke up at a different time
            </Button>

            <Button
              variant="ghost"
              onClick={onStillSleeping}
              isLoading={busy}
              className="w-full justify-start text-amber-600 dark:text-amber-400"
            >
              <span className="mr-2">🌙</span>
              Still sleeping
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Only you know when you actually woke up — your answer is what gets recorded.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReminderPanel({
  prompt,
  onStartNow,
  onDismiss,
  busy,
}: {
  prompt: SleepPromptView;
  onStartNow: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const deadlineMs =
    Date.parse(prompt.scheduledFor) + prompt.autoStartAfterMinutes * 60_000;
  const secondsLeft = Math.max(
    0,
    // eslint-disable-next-line react-hooks/purity -- live countdown
    Math.round((deadlineMs - Date.now()) / 1000)
  );
  const countdown = formatCountdown(secondsLeft);

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Time to wind down</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your target bedtime is{' '}
            <span className="font-semibold text-foreground">{prompt.targetBedtime || '\u2014'}</span>.
            Sleep starts automatically in{' '}
            <span className="font-semibold text-foreground tabular-nums">{countdown}</span> unless
            you say &ldquo;Not yet&rdquo;.
          </p>
        </div>
        <Timer className="h-6 w-6 text-amber-500/70" aria-hidden="true" />
      </div>
      {secondsLeft >= 0 && (
        <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">{countdown}</p>
      )}
      <div className="mt-4 flex items-center gap-2">
        <Button onClick={onStartNow} isLoading={busy} className="flex-1">
          Start now
        </Button>
        <Button variant="outline" onClick={onDismiss} isLoading={busy} className="flex-1">
          Not yet
        </Button>
      </div>
    </div>
  );
}

/**
 * Pre-warning panel shown 1 hour before bedtime.
 */
function PreWarningPanel({
  preWarning,
  onDismiss,
  busy,
}: {
  preWarning: { targetBedtime: string; preWarningTime: string };
  onDismiss: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Sleep schedule approaching</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your sleep schedule starts in 1 hour (at <span className="font-semibold text-foreground">{preWarning.targetBedtime}</span>). Start winding down!
          </p>
        </div>
        <Clock3 className="h-6 w-6 text-blue-500/70" aria-hidden="true" />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="outline" onClick={onDismiss} isLoading={busy} className="flex-1">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/**
 * Wake prompt panel shown at target wake time.
 */
function WakePromptPanel({
  wakePrompt,
  onWokeAtTarget,
  onWokeLater,
  onStillSleeping,
  busy,
}: {
  wakePrompt: { targetWakeTime: string };
  onWokeAtTarget: () => void;
  onWokeLater: () => void;
  onStillSleeping: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Good morning!</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your target wake time is <span className="font-semibold text-foreground">{wakePrompt.targetWakeTime}</span>. Did you wake up now?
          </p>
        </div>
        <BedDouble className="h-6 w-6 text-emerald-500/70" aria-hidden="true" />
      </div>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <Button onClick={onWokeAtTarget} isLoading={busy} className="flex-1">
          Yes, at {wakePrompt.targetWakeTime}
        </Button>
        <Button variant="outline" onClick={onWokeLater} isLoading={busy} className="flex-1">
          I woke up later
        </Button>
        <Button variant="outline" onClick={onStillSleeping} isLoading={busy} className="flex-1">
          Still sleeping
        </Button>
      </div>
    </div>
  );
}

/**
 * Today's sleep summary.
 *
 * ERROR.md A4 asked for a sleep quality meter on /today. This rendered the
 * self-rated quality as a bare `4/5` text cell, so there was no score, no band
 * and no visual weight. It now computes the same 0â€“100 score the dashboard uses
 * (duration vs target, adjusted by the self-rating and restedness) and renders
 * the shared `SleepQualityMeter`.
 */
function SleepSummary({ log, targetBedtime, targetWakeTime }: { log: SleepLogView; targetBedtime?: string | null; targetWakeTime?: string | null }) {
  /**
   * Null when there is no target window: the score is "actual vs planned", so
   * with no target there is nothing to measure against. A 0 here would read as
   * awful sleep rather than unmeasured.
   */
  const plannedMinutes =
    targetBedtime && targetWakeTime ? calculateSleepDuration(targetBedtime, targetWakeTime) : null;

  const score =
    log.actualDurationMinutes != null && plannedMinutes !== null
      ? calculateSleepScore(
          log.actualDurationMinutes,
          plannedMinutes,
          log.quality,
          log.feltRested
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Bedtime</p>
          <p className="text-xl font-semibold text-foreground">{log.actualBedtime || '\u2014'}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Wake Time</p>
          <p className="text-xl font-semibold text-foreground">{log.actualWakeTime || '\u2014'}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Duration</p>
          <p className="text-xl font-semibold text-foreground">
            {log.actualDurationMinutes ? formatDuration(log.actualDurationMinutes) : '\u2014'}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Target</p>
          <p className="text-xl font-semibold text-foreground">
            {plannedMinutes !== null ? formatDuration(plannedMinutes) : '\u2014'}
          </p>
        </div>
      </div>

      <SleepQualityMeter
        score={score}
        quality={log.quality}
        feltRested={log.feltRested}
        wakeUpCount={log.wakeUpCount}
      />
    </div>
  );
}

function SleepForm({
  onSave,
  initialData,
  error,
}: {
  onSave: (data: { actualBedtime: string; actualWakeTime: string; quality: number; feltRested: boolean }) => Promise<void>;
  initialData: SleepLogView | null;
  /** Save failure from the parent, rendered inside the dialog. */
  error?: string | null;
}) {
  const [formData, setFormData] = useState({
    actualBedtime: initialData?.actualBedtime || '',
    actualWakeTime: initialData?.actualWakeTime || '',
    quality: initialData?.quality || 3,
    feltRested: initialData?.feltRested || false,
  });
  const [saving, setSaving] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    void onSave(formData).finally(() => setSaving(false));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="sleep-bedtime" className="mb-1 block text-sm font-medium text-foreground">Bedtime</label>
        <Input
          type="time"
          value={formData.actualBedtime}
          onChange={(e) => setFormData({ ...formData, actualBedtime: e.target.value })}
          required
        />
      </div>
      <div>
        <label htmlFor="sleep-waketime" className="mb-1 block text-sm font-medium text-foreground">Wake Time</label>
        <Input
          type="time"
          value={formData.actualWakeTime}
          onChange={(e) => setFormData({ ...formData, actualWakeTime: e.target.value })}
          required
        />
      </div>
      <div>
        <label htmlFor="sleep-quality" className="mb-1 block text-sm font-medium text-foreground">Quality (1-5)</label>
        <Input
          type="number"
          min="1"
          max="5"
          value={formData.quality}
          onChange={(e) => setFormData({ ...formData, quality: parseInt(e.target.value, 10) })}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="feltRested"
          checked={formData.feltRested}
          onChange={(e) => setFormData({ ...formData, feltRested: e.target.checked })}
        />
        <label htmlFor="feltRested" className="text-sm text-foreground">
          I felt rested
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" isLoading={saving}>
        Save Sleep Data
      </Button>
    </form>
  );
}

function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export default TodaySleep;