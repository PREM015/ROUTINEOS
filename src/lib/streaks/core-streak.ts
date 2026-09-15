import { parseSnapshot } from "../scoring/snapshot";

export function doesDayQualifyForStreak(score: any): boolean {
  if (score.score >= 50) return true;
  return false;
}

export function doesDayQualifyForCoreStreak(score: any): boolean {
  const snapshot = typeof score.snapshot === 'string' ? parseSnapshot(score.snapshot) : score.snapshot;
  if (!snapshot) return false;
  
  if (snapshot.dayMode === 'REST') return true;

  const nonNegMet = snapshot.nonNegCompleted === snapshot.nonNegTotal;
  const growthMet = snapshot.growthTotal > 0 ? (snapshot.growthCompleted / snapshot.growthTotal) >= 0.6 : true;

  return nonNegMet && growthMet;
}
