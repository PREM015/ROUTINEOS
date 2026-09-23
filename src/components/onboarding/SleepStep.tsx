"use client";

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function SleepStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [bedtime, setBedtime] = useState('22:00');
  const [waketime, setWaketime] = useState('06:00');

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
            onChange={(e) => setBedtime(e.target.value)}
          />
          <Input
            type="time"
            label="Target Wake Time"
            value={waketime}
            onChange={(e) => setWaketime(e.target.value)}
          />
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