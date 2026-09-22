'use client';

import React, { useState } from 'react';
import { Modal, Input, Select, Button } from '@/components/ui';
import { useApp, type HabitTier, type FrequencyType } from '@/context/AppContext';
import { getTodayString } from '@/lib/dates';

interface AddHabitModalProps {
  open: boolean;
  onClose: () => void;
}

const TIERS: Array<{ label: string; value: HabitTier }> = [
  { label: 'Growth', value: 'GROWTH' },
  { label: 'Bonus', value: 'BONUS' },
  { label: 'Lifestyle', value: 'LIFESTYLE' },
  { label: 'Flexible', value: 'FLEXIBLE' },
  { label: 'Experimental', value: 'EXPERIMENTAL' },
];

const FREQUENCIES: Array<{ label: string; value: FrequencyType }> = [
  { label: 'Everyday', value: 'DAILY' },
  { label: 'Specific weekdays', value: 'SPECIFIC_WEEKDAYS' },
  { label: 'Weekly target', value: 'WEEKLY_TARGET' },
  { label: 'Monthly target', value: 'MONTHLY_TARGET' },
];

const WEEKDAYS = [
  { label: 'Sun', value: '0' },
  { label: 'Mon', value: '1' },
  { label: 'Tue', value: '2' },
  { label: 'Wed', value: '3' },
  { label: 'Thu', value: '4' },
  { label: 'Fri', value: '5' },
  { label: 'Sat', value: '6' },
];

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AddHabitModal({ open, onClose }: AddHabitModalProps) {
  const { addHabit } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState<HabitTier>('GROWTH');
  const [frequencyType, setFrequencyType] = useState<FrequencyType>('DAILY');
  const [weekdays, setWeekdays] = useState<string[]>(['1', '2', '3', '4', '5']);
  const [targetCount, setTargetCount] = useState('');
  const [color, setColor] = useState<string>(COLORS[0] as string);
  const [reminderTime, setReminderTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setDescription('');
    setTier('GROWTH');
    setFrequencyType('DAILY');
    setWeekdays(['1', '2', '3', '4', '5']);
    setTargetCount('');
    setColor(COLORS[0] as string);
    setReminderTime('');
    setError(null);
    setSubmitting(false);
  };

  const toggleWeekday = (value: string) => {
    setWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const parsedTarget = targetCount.trim() ? parseInt(targetCount.trim(), 10) : undefined;
      if (targetCount.trim() && (!parsedTarget || parsedTarget < 1)) {
        throw new Error('Target count must be a positive number');
      }
      if (frequencyType === 'SPECIFIC_WEEKDAYS' && weekdays.length === 0) {
        throw new Error('Pick at least one weekday');
      }
      if (reminderTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(reminderTime)) {
        throw new Error('Reminder time must be HH:mm');
      }

      await addHabit({
        name: name.trim(),
        description: description.trim() || undefined,
        tier,
        status: 'ACTIVE',
        color,
        frequencyType,
        frequencyValue:
          frequencyType === 'SPECIFIC_WEEKDAYS'
            ? [...weekdays].sort().join(',')
            : frequencyType === 'WEEKLY_TARGET' || frequencyType === 'MONTHLY_TARGET'
              ? String(parsedTarget ?? 1)
              : undefined,
        targetCount: parsedTarget,
        startDate: getTodayString(),
        reminderTime: reminderTime || undefined,
        reminderEnabled: Boolean(reminderTime),
      });

      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create habit');
      setSubmitting(false);
    }
  };

  const close = () => {
    if (!submitting) {
      reset();
      onClose();
    }
  };

  return (
    <Modal isOpen={open} onClose={close} title="Add New Habit">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Habit Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning Workout"
          required
          autoFocus
        />

        <div>
          <label htmlFor="habit-desc" className="block text-sm font-medium mb-1 text-foreground">Description (optional)</label>
          <textarea
            id="habit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why does this habit matter?"
            rows={2}
            maxLength={500}
            className="w-full p-2.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as HabitTier)}
            options={TIERS}
          />
          <Select
            label="Frequency"
            value={frequencyType}
            onChange={(e) => setFrequencyType(e.target.value as FrequencyType)}
            options={FREQUENCIES}
          />
        </div>

        {frequencyType === 'SPECIFIC_WEEKDAYS' && (
          <div>
            <span className="block text-sm font-medium mb-2 text-foreground">Weekdays</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  aria-pressed={weekdays.includes(d.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    weekdays.includes(d.value)
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-300'
                      : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(frequencyType === 'WEEKLY_TARGET' || frequencyType === 'MONTHLY_TARGET') && (
          <Input
            label={frequencyType === 'WEEKLY_TARGET' ? 'Times per week' : 'Times per month'}
            type="number"
            min={1}
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
            placeholder="e.g. 4"
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-sm font-medium mb-2 text-foreground">Colour</span>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  className={`w-7 h-7 rounded-full border-2 transition ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Input
            label="Reminder (optional)"
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-500 dark:text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={close} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || submitting}>
            {submitting ? 'Adding...' : 'Add Habit'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
