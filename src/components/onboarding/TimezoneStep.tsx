"use client";

import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

export function TimezoneStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

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
          onChange={(e) => setTimezone(e.target.value)}
          options={[
            { value: timezone, label: timezone },
            { value: 'America/New_York', label: 'America/New_York' },
            { value: 'Europe/London', label: 'Europe/London' },
            { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
          ]}
        />

        <div className="flex gap-4">
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