"use client";

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function HabitStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [habits, setHabits] = useState(['', '', '']);

  const updateHabit = (index: number, value: string) => {
    setHabits((current) => current.map((h, i) => (i === index ? value : h)));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Add 3 Key Habits</h2>
        <p className="mt-2 text-muted-foreground">What are the small things that make a big difference?</p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        <div className="space-y-3">
          {habits.map((habit, index) => (
            <Input
              key={index}
              type="text"
              value={habit}
              onChange={(e) => updateHabit(index, e.target.value)}
              placeholder={`Habit ${index + 1} (e.g. Read 10 pages, Meditate)`}
            />
          ))}
        </div>

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="button" onClick={onNext} className="flex-1">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}