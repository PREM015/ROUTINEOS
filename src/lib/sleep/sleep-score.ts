export function calculateSleepScore(params: { actualMinutes: number; targetMinutes: number; bedtime: string; targetBedtime: string; wakeTime: string; targetWakeTime: string }): number {
  let score = 100;
  
  if (params.actualMinutes < params.targetMinutes) {
    const diff = params.targetMinutes - params.actualMinutes;
    const penalty = Math.min(40, (diff / 60) * 15);
    score -= penalty;
  }
  
  function timeToMins(t: string) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  
  function diffMinutes(t1: string, t2: string) {
    let m1 = timeToMins(t1);
    let m2 = timeToMins(t2);
    let diff = Math.abs(m1 - m2);
    if (diff > 12 * 60) {
      diff = 24 * 60 - diff;
    }
    return diff;
  }
  
  const bedDiff = diffMinutes(params.bedtime, params.targetBedtime);
  const bedPenalty = Math.min(30, (bedDiff / 60) * 10);
  score -= bedPenalty;
  
  const wakeDiff = diffMinutes(params.wakeTime, params.targetWakeTime);
  const wakePenalty = Math.min(30, (wakeDiff / 60) * 10);
  score -= wakePenalty;
  
  return Math.max(0, Math.round(score));
}

export function getSleepScoreBand(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Excellent', color: 'text-green-600 bg-green-100' };
  if (score >= 80) return { label: 'Good', color: 'text-blue-600 bg-blue-100' };
  if (score >= 60) return { label: 'Fair', color: 'text-yellow-600 bg-yellow-100' };
  return { label: 'Poor', color: 'text-red-600 bg-red-100' };
}
