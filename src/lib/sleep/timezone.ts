import { fromZonedTime } from 'date-fns-tz';

export function getLocalTime(utcTime: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(utcTime);
}

/**
 * Interpret a wall-clock `HH:mm` on `date` as an instant in `timezone`.
 *
 * The timezone argument used to be accepted and discarded (`_timezone`), so the
 * result was parsed in the **host's** local zone — the exact server-timezone
 * leak the rest of the sleep stack avoids via `fromZonedTime`/`formatInTimeZone`.
 * It is honoured now.
 *
 * Returns `null` on an unparseable input rather than an `Invalid Date`, so a
 * caller cannot silently persist `NaN` as a duration.
 */
export function parseTimeInTimezone(
  timeStr: string,
  date: string,
  timezone: string
): Date | null {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const parsed = fromZonedTime(`${date}T${timeStr}:00`, timezone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isOvernightSleep(bedtime: string, wakeTime: string): boolean {
  const [bH = 0, bM = 0] = bedtime.split(':').map(Number);
  const [wH = 0, wM = 0] = wakeTime.split(':').map(Number);
  const bMins = bH * 60 + bM;
  const wMins = wH * 60 + wM;
  return wMins < bMins;
}
