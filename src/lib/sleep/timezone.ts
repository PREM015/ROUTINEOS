export function getLocalTime(utcTime: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(utcTime);
}

export function parseTimeInTimezone(timeStr: string, date: string, _timezone: string): Date {
  const isoString = `${date}T${timeStr}:00`;
  return new Date(isoString);
}

export function isOvernightSleep(bedtime: string, wakeTime: string): boolean {
  const [bH = 0, bM = 0] = bedtime.split(':').map(Number);
  const [wH = 0, wM = 0] = wakeTime.split(':').map(Number);
  const bMins = bH * 60 + bM;
  const wMins = wH * 60 + wM;
  return wMins < bMins;
}
