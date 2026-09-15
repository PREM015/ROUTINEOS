import { parseSnapshot } from "../scoring/snapshot";

export function doesMinimumDayQualify(score: any): boolean {
  const snapshot = typeof score.snapshot === 'string' ? parseSnapshot(score.snapshot) : score.snapshot;
  if (!snapshot) return false;
  return snapshot.nonNegCompleted === snapshot.nonNegTotal;
}
