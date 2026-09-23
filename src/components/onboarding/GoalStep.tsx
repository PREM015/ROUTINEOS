"use client";

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function GoalStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [goal, setGoal] = useState('');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Set a Monthly Goal</h2>
        <p className="mt-2 text-muted-foreground">What is your primary focus for this month?</p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        <Input
          type="text"
          label="Monthly goal"
          placeholder="e.g. Launch my side project, Run 50 miles"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />

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