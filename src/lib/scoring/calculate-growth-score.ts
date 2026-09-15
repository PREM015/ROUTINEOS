export function calculateGrowthScore(completed: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((completed / total) * 100);
}
