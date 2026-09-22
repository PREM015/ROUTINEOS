/**
 * Sleep Duration Calculations
 * Calculate sleep duration handling overnight periods
 */

export function calculateSleepDuration(
  bedtime: string,
  wakeTime: string
): number {
  const [bedHour = 0, bedMin = 0] = bedtime.split(':').map(Number);
  const [wakeHour = 0, wakeMin = 0] = wakeTime.split(':').map(Number);

  let bedMinutes = bedHour * 60 + bedMin;
  let wakeMinutes = wakeHour * 60 + wakeMin;

  // Handle overnight sleep
  if (wakeMinutes <= bedMinutes) {
    wakeMinutes += 24 * 60;
  }

  return wakeMinutes - bedMinutes;
}

export function calculateSleepDeficit(
  actualDuration: number,
  targetDuration: number
): number {
  return Math.max(0, targetDuration - actualDuration);
}

export function calculateSleepScore(
  actualDuration: number,
  targetDuration: number,
  quality: number | null,
  feltRested: boolean | null
): number {
  let score = 0;

  // Duration score (50 points max)
  const durationPercentage = Math.min(100, (actualDuration / targetDuration) * 100);
  score += (durationPercentage / 100) * 50;

  // Quality score (30 points max)
  if (quality) {
    score += (quality / 5) * 30;
  }

  // Rested score (20 points max)
  if (feltRested !== null) {
    score += feltRested ? 20 : 0;
  }

  return Math.round(score);
}

export function formatSleepDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function getSleepQualityLabel(quality: number): string {
  if (quality >= 4.5) return 'Excellent';
  if (quality >= 3.5) return 'Good';
  if (quality >= 2.5) return 'Fair';
  if (quality >= 1.5) return 'Poor';
  return 'Very Poor';
}

export function getSleepRecommendation(
  actualDuration: number,
  targetDuration: number,
  quality: number | null,
  deficit: number
): string[] {
  const recommendations: string[] = [];

  if (actualDuration < targetDuration - 60) {
    recommendations.push('Try to get to bed 30-60 minutes earlier');
  }

  if (actualDuration > targetDuration + 120) {
    recommendations.push('You might be oversleeping. Consider a consistent wake time');
  }

  if (quality && quality < 3) {
    recommendations.push('Focus on sleep quality: dark room, cool temperature, no screens');
  }

  if (deficit > 120) {
    recommendations.push('You have significant sleep debt. Prioritize rest this week');
  }

  if (recommendations.length === 0) {
    recommendations.push('Great sleep! Keep up the good habits');
  }

  return recommendations;
}