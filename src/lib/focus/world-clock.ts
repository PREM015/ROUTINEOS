export interface ClockHandAngles {
  hour: number;
  minute: number;
  second: number;
}

export function getClockHandAngles(
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): ClockHandAngles {
  const secondsWithFraction = second + millisecond / 1000;
  const minutesWithFraction = minute + secondsWithFraction / 60;
  const hoursWithFraction = (hour % 12) + minutesWithFraction / 60;

  return {
    hour: hoursWithFraction * 30,
    minute: minutesWithFraction * 6,
    second: secondsWithFraction * 6,
  };
}

export function getDurationHandAngles(durationMs: number): ClockHandAngles {
  const clampedMs = Math.max(0, durationMs);
  const totalSeconds = Math.floor(clampedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = clampedMs % 1000;

  return getClockHandAngles(hours, minutes, seconds, milliseconds);
}

export function getCountdownHandAngles(remainingMs: number): ClockHandAngles {
  return getDurationHandAngles(remainingMs);
}
