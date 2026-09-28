"use client";

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function SleepStep({
  bedtime,
  waketime,
  onBedtimeChange,
  onWaketimeChange,
  onNext,
  onBack,
  saving,
}: {
  bedtime: string;
  waketime: string;
  onBedtimeChange: (value: string) => void;
  onWaketimeChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Set your sleep schedule</h2>
        <p className="mt-2 text-muted-foreground">Consistent sleep is the foundation of productivity.</p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        <div className="space-y-3">
          <Input
            type="time"
            label="Target Bedtime"
            value={bedtime}
            onChange={(e) => onBedtimeChange(e.target.value)}
            helperText="Used for your bedtime reminder. Change it any time in Settings → Sleep."
          />
          <Input
            type="time"
            label="Target Wake Time"
            value={waketime}
            onChange={(e) => onWaketimeChange(e.target.value)}
          />
        </div>

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
