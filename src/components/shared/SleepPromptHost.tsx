'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSleepSession } from '@/hooks/useSleepSession';

/**
 * SleepPromptHost
 * Floating prompt card shown while a sleep prompt is pending. Mounted once in
 * the dashboard layout so the prompt is reachable from any page. Skipped on
 * /today, where the inline TodaySleep panel renders the same prompt.
 */

export function SleepPromptHost() {
  const pathname = usePathname();
  const { state, busy, error, respond, loading } = useSleepSession();
  const [removed, setRemoved] = useState(false);

  const prompt = state?.prompt ?? null;

  // A dismissed/completed prompt should not reappear mid-session.
  useEffect(() => {
    if (!prompt) setRemoved(false);
  }, [prompt]);

  if (loading || removed) return null;
  if (pathname === '/today') return null;
  if (!prompt) return null;

  const deadlineMs =
    Date.parse(prompt.scheduledFor) + prompt.autoStartAfterMinutes * 60_000;
  const secondsLeft = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(
    secondsLeft % 60
  ).padStart(2, '0')}`;

  return (
    <div className="fixed bottom-24 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] md:bottom-6">
      <div className="rounded-xl border border-amber-500/40 bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Time to wind down</p>
          <Timer className="h-4 w-4 text-amber-500/70" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Target bedtime {prompt.targetBedtime || '\u2014'}. Auto-starts in{' '}
          <span className="font-semibold text-foreground tabular-nums">{countdown}</span> unless
          you say &ldquo;Not yet&rdquo;.
        </p>
        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => void respond('YES')}
            isLoading={busy === 'respond'}
          >
            Start now
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => {
              void respond('NOT_YET');
              setRemoved(true);
            }}
            isLoading={busy === 'respond'}
          >
            Not yet
          </Button>
        </div>
      </div>
    </div>
  );
}