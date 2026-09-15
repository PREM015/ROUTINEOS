export function calculateSleepDuration(bedtime: string, wakeTime: string): { hours: number; minutes: number; totalMinutes: number } {
  const [bedHours, bedMins] = bedtime.split(':').map(Number);
  const [wakeHours, wakeMins] = wakeTime.split(':').map(Number);
  
  let bedMinutes = bedHours * 60 + bedMins;
  let wakeMinutes = wakeHours * 60 + wakeMins;
  
  if (wakeMinutes < bedMinutes) {
    // overnight
    wakeMinutes += 24 * 60;
  }
  
  const totalMinutes = wakeMinutes - bedMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return { hours, minutes, totalMinutes };
}

export function formatSleepDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`.trim();
  }
  return `${minutes}m`;
}

export function isSleepDurationHealthy(totalMinutes: number, targetMinutes: number): boolean {
  return totalMinutes >= targetMinutes;
}
