"use client";

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function GoalStep({
  goal,
  onChange,
  onNext,
  onBack,
  saving,
}: {
  goal: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}) {
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
          onChange={(e) => onChange(e.target.value)}
          maxLength={200}
          helperText="Leave blank to skip."
        />

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
