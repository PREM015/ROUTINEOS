'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { useNowMinutes } from '@/hooks/useNowMinutes';

export function RoutineDriftDisplay({ className }: { className?: string }) {
  const { timezone, today } = useUserTimezone();
  const { minutes: nowMinutes } = useNowMinutes(timezone);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!today) return;
    setLoading(true);
    setError(false);
  }, [today]);

  const { current } = useMemo(() => ({ current: null }), [nowMinutes]);

  if (loading || error || !current) return null;

  return (
    <section className={cn("w-full max-w-sm", className)}>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        Routine drift
      </h2>
      <div>Minimal test</div>
    </section>
  );
}

export default RoutineDriftDisplay;