"use client";

import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { TIMEZONE_OPTIONS } from './onboarding-options';

export function TimezoneStep({
  timezone,
  onChange,
  onNext,
  onBack,
  saving,
}: {
  timezone: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Where are you located?</h2>
        <p className="mt-2 text-muted-foreground">We use this to reset your daily habits at the right time.</p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        <Select
          label="Timezone"
          value={timezone}
          onChange={(e) => onChange(e.target.value)}
          options={TIMEZONE_OPTIONS}
          helperText="Drives when your day rolls over, and how scores and streaks are bucketed."
        />

        <div className="flex gap-4">
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
