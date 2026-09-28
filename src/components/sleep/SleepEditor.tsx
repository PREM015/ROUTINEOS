'use client';
import React, { useState, useEffect } from 'react';
import { SleepLog, SleepFormData } from '@/types/sleep';
import { calculateSleepDuration, formatSleepDuration } from '@/lib/sleep/calculate-duration';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface SleepEditorProps {
  sleepLog?: SleepLog | null;
  onSave: (data: SleepFormData) => void;
  onCancel: () => void;
}

export function SleepEditor({ sleepLog, onSave, onCancel }: SleepEditorProps) {
  const [bedtime, setBedtime] = useState(sleepLog?.actualBedtime || '23:00');
  const [wakeTime, setWakeTime] = useState(sleepLog?.actualWakeTime || '07:00');
  const [notes, setNotes] = useState(sleepLog?.notes || '');
  const [durationStr, setDurationStr] = useState('');

  useEffect(() => {
    if (bedtime && wakeTime) {
      const duration = calculateSleepDuration(bedtime, wakeTime);
      setDurationStr(formatSleepDuration(duration));
    } else {
      setDurationStr('');
    }
  }, [bedtime, wakeTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ bedtime, wakeTime, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Log sleep</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sleep-bedtime" className="mb-1 block text-sm font-medium text-foreground">
            Bedtime
          </label>
          <Input
            id="sleep-bedtime"
            type="time"
            required
            value={bedtime}
            onChange={(e) => setBedtime(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="sleep-waketime" className="mb-1 block text-sm font-medium text-foreground">
            Wake time
          </label>
          <Input
            id="sleep-waketime"
            type="time"
            required
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
          />
        </div>
      </div>

      {durationStr && (
        <p className="text-sm text-muted-foreground">
          Calculated duration:{' '}
          <span className="font-medium tabular-nums text-foreground">{durationStr}</span>
        </p>
      )}

      <div>
        <label htmlFor="sleep-notes" className="mb-1 block text-sm font-medium text-foreground">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="sleep-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md border border-input bg-background p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={3}
        />
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
