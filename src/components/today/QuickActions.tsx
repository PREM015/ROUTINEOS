'use client';

import { MinimumDayButton } from './MinimumDayButton';
import { RestDayButton } from './RestDayButton';

export function QuickActions({ date }: { date: string }) {
  return (
    <div className="flex gap-4 mb-6">
      <MinimumDayButton date={date} />
      <RestDayButton date={date} />
    </div>
  );
}
