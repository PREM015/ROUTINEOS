'use client';

import { useEffect, useRef, useState } from 'react';
import { Moon, BedDouble, Clock3, Timer } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { showNotification } from '@/lib/pwa/notifications';
import {
  useSleepSession,
  type SleepLogView,
  type SleepPromptView,
} from '@/hooks/useSleepSession';

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
  } = useSleepSession();
  const [isEditing, setIsEditing] = useState(false);
  const notifiedReminder = useRef<Set<string>>(new Set());
  const [longRunningOpen, setLongRunningOpen] = useState(false);

  const active = state?.active ?? null;
  const prompt = state?.prompt ?? null;
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

  const handleStop = () => {
    if (longRunning) {
      setLongRunningOpen(true);
    } else {
      void stop();
    }
  };

  const confirmLongRunningStop = () => {
    setLongRunningOpen(false);
    void stop();
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-20 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
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
                    try {
                      const res = await fetch('/api/sleep', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date, ...formData }),
                      });
                      if (res.ok) {
                        setIsEditing(false);
                        await fetch('/api/sleep/session', { credentials: 'include' });
                      }
                    } catch {
                      // keep dialog open
                    }
                  }}
                  initialData={todaySleepLog}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
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
      ) : (
        <div>
          {hasLog ? (
            <SleepSummary log={todaySleepLog as SleepLogView} />
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

      {longRunningOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl bg-background p-6 shadow-lg">
            <h2 className="text-base font-semibold text-foreground">
              Still sleeping?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
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
          </div>
        </div>
      )}
    </Card>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
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
        <Timer className="h-6 w-6 text-amber-500/70" />
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

function SleepSummary({ log }: { log: SleepLogView }) {
  return (
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
        <p className="text-sm text-muted-foreground">Quality</p>
        <p className="text-xl font-semibold text-foreground">
          {log.quality ? `${log.quality}/5` : '\u2014'}
        </p>
      </div>
      {log.feltRested !== null && (
        <div className="col-span-2">
          <p className="text-sm text-muted-foreground">Felt rested</p>
          <p className="text-sm font-medium text-foreground">
            {log.feltRested ? 'Yes' : 'No'}
          </p>
        </div>
      )}
    </div>
  );
}

function SleepForm({
  onSave,
  initialData,
}: {
  onSave: (data: { actualBedtime: string; actualWakeTime: string; quality: number; feltRested: boolean }) => Promise<void>;
  initialData: SleepLogView | null;
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
        <label className="block text-sm font-medium text-foreground mb-1">Bedtime</label>
        <Input
          type="time"
          value={formData.actualBedtime}
          onChange={(e) => setFormData({ ...formData, actualBedtime: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Wake Time</label>
        <Input
          type="time"
          value={formData.actualWakeTime}
          onChange={(e) => setFormData({ ...formData, actualWakeTime: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Quality (1-5)</label>
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