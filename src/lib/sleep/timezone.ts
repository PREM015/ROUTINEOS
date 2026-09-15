export function getLocalTime(utcTime: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(utcTime);
}

export function parseTimeInTimezone(timeStr: string, date: string, timezone: string): Date {
  const isoString = `${date}T${timeStr}:00`;
  return new Date(isoString);
}

export function isOvernightSleep(bedtime: string, wakeTime: string): boolean {
  const [bH, bM] = bedtime.split(':').map(Number);
  const [wH, wM] = wakeTime.split(':').map(Number);
  const bMins = bH * 60 + bM;
  const wMins = wH * 60 + wM;
  return wMins < bMins;
}
