'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { useUserTimezone } from '@/hooks/useUserTimezone';
import { useFocusNow } from '@/hooks/useFocusNow';
import { getClockHandAngles } from '@/lib/focus/world-clock';
import { AnalogClockFace } from '@/components/focus/AnalogClockFace';
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function partValue(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new Error(`The local clock is missing its ${type} value.`);
  }
  return Number(value);
}

function FocusWorldClock() {
  const { timezone } = useUserTimezone();
  const now = useFocusNow();
  const isHydrated = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const formatters = useMemo(
    () => ({
      time: new Intl.DateTimeFormat(undefined, {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      }),
      clock: new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      date: new Intl.DateTimeFormat(undefined, {
        timeZone: timezone,
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      zone: new Intl.DateTimeFormat(undefined, {
        timeZone: timezone,
        timeZoneName: 'short',
      }),
    }),
    [timezone],
  );

  if (!isHydrated) {
    return (
      <section
        aria-labelledby="focus-local-time-heading"
        className="border-border/70 bg-card/80 rounded-[1.75rem] border p-5 shadow-sm backdrop-blur-xl sm:p-6"
      >
        <h2 id="focus-local-time-heading" className="text-foreground text-base font-semibold">
          Local time
        </h2>
        <div className="bg-muted/50 mt-4 h-36 animate-pulse rounded-2xl" aria-hidden="true" />
      </section>
    );
  }

  const date = new Date(now);
  const clockParts = formatters.clock.formatToParts(date);
  const hour = partValue(clockParts, 'hour');
  const minute = partValue(clockParts, 'minute');
  const second = partValue(clockParts, 'second');
  const angles = getClockHandAngles(hour, minute, second, date.getMilliseconds());
  const zoneName = formatters.zone
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  const displayTime = formatters.time.format(date);
  const dateTime = date.toISOString();

  return (
    <section
      aria-labelledby="focus-local-time-heading"
      className="border-border/70 bg-card/80 rounded-[1.75rem] border p-5 shadow-sm backdrop-blur-xl sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-accent-focus text-[0.68rem] font-bold uppercase tracking-[0.2em]">
            Local time
          </p>
          <h2
            id="focus-local-time-heading"
            className="text-foreground mt-1 text-base font-semibold"
          >
            Your timezone
          </h2>
        </div>
        <span className="text-muted-foreground max-w-[45%] truncate text-xs" title={timezone}>
          {zoneName ?? timezone}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(6rem,0.8fr)_minmax(0,1.2fr)] items-center gap-3 sm:gap-5">
        <AnalogClockFace
          angles={angles}
          label={`${displayTime} local time in ${timezone}`}
          gradientId="focus-world-clock-face"
        />

        <div className="min-w-0">
          <time
            dateTime={dateTime}
            aria-hidden="true"
            className="text-foreground block font-mono text-[clamp(1.125rem,4vw,1.75rem)] font-semibold tabular-nums leading-none tracking-tight"
          >
            {displayTime}
          </time>
          <p className="text-muted-foreground mt-3 text-sm">{formatters.date.format(date)}</p>
          <p className="text-muted-foreground mt-1 truncate text-xs" title={timezone}>
            {timezone}
          </p>
        </div>
      </div>
    </section>
  );
}

export { FocusWorldClock };
export default FocusWorldClock;
