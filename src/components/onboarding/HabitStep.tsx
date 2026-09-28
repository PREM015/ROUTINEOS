"use client";

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function HabitStep({
  habits,
  onChange,
  onNext,
  onBack,
  saving,
}: {
  habits: string[];
  onChange: (value: string[]) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const filled = habits.filter((h) => h.trim().length > 0).length;

  const update = (index: number, value: string) => {
    onChange(habits.map((h, i) => (i === index ? value : h)));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Add up to 3 Key Habits</h2>
        <p className="mt-2 text-muted-foreground">What are the small things that make a big difference?</p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        <div className="space-y-3">
          {habits.map((habit, index) => (
            <Input
              key={index}
              type="text"
              value={habit}
              onChange={(e) => update(index, e.target.value)}
              placeholder={`Habit ${index + 1} (e.g. Read 10 pages, Meditate)`}
              maxLength={100}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {filled === 0
            ? 'Leave blank to skip — you can add habits later.'
            : `${filled} habit${filled === 1 ? '' : 's'} will be created.`}
        </p>

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={saving}>
            Back
          </Button>
          <Button type="button" onClick={onNext} className="flex-1" isLoading={saving}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
