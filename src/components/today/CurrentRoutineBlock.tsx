'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Mount } from '@/components/motion/Mount';
import { getCurrentBlock, calculateBlockProgress } from '@/lib/routine/duration';

interface Block {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description: string | null;
  icon: string | null;
}

export function CurrentRoutineBlock() {
  const [currentBlock, setCurrentBlock] = useState<Block | null>(null);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');
  /**
   * Set when the routine could not be loaded.
   *
   * The card is *supposed* to be absent when nothing is running, so a failed
   * fetch was previously invisible: `res.ok` was never checked, a 500 parsed to
   * `data.success === undefined`, and `!currentBlock` rendered `null` exactly as
   * a genuinely empty schedule does. The user had no way to tell "I have nothing
   * scheduled" from "the schedule failed to load".
   */
  const [error, setError] = useState<string | null>(null);

  const fetchRoutine = useCallback(async () => {
    try {
      const res = await fetch('/api/routine/today');
      if (!res.ok) {
        throw new Error(`Could not load your routine (status ${res.status})`);
      }
      const data = await res.json();

      if (data.success && data.data.blocks) {
        setError(null);
        const current = getCurrentBlock(data.data.blocks) as Block | null;
        setCurrentBlock(current);

        if (current) {
          const prog = calculateBlockProgress(current.startTime, current.endTime);
          setProgress(prog.percentage);
          setTimeRemaining(formatMinutes(prog.minutesRemaining));
        }
      } else {
        setError(data.error || 'Could not load your routine');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load your routine'
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void fetchRoutine();
    const interval = setInterval(fetchRoutine, 60000); // Update every minute
    window.addEventListener('day-mode-changed', fetchRoutine);
    return () => {
      clearInterval(interval);
      window.removeEventListener('day-mode-changed', fetchRoutine);
    };
  }, [fetchRoutine]);

  // A load failure is shown rather than hidden: the card is designed to vanish
  // when no block is running, so a silent failure is indistinguishable from an
  // empty day.
  if (error && !currentBlock) {
    return (
      <Card className="p-4">
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void fetchRoutine()}
          className="mt-1 text-sm font-semibold text-primary hover:underline"
        >
          Try again
        </button>
      </Card>
    );
  }

  if (!currentBlock) {
    return null;
  }

  return (
    <Mount>
      <Card className="p-6 bg-gradient-to-r from-primary/10 via-card to-card border-primary/20">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex items-center gap-3">
            {currentBlock.icon && (
              <span className="text-3xl">{currentBlock.icon}</span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{currentBlock.title}</h3>
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {currentBlock.startTime} - {currentBlock.endTime}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm text-muted-foreground">Time Remaining</p>
            <p className="text-xl font-bold text-primary tabular-nums">{timeRemaining}</p>
          </div>
        </div>

        {currentBlock.description && (
          <p className="text-sm text-muted-foreground mb-4">{currentBlock.description}</p>
        )}

        <Progress value={progress} className="h-2" />
      </Card>
    </Mount>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'Less than a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}