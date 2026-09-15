import { parseSnapshot } from "../scoring/snapshot";

export function isRestDay(score: any): boolean {
  const snapshot = typeof score.snapshot === 'string' ? parseSnapshot(score.snapshot) : score.snapshot;
  if (!snapshot) return false;
  return snapshot.dayMode === 'REST';
}

export function restDayPreservesStreak(): boolean {
  return true;
}
