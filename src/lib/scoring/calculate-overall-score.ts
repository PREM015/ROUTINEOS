export function calculateOverallScore(params: {
  coreScore: number;
  dayMode: string;
  nonNegCompleted: number;
  nonNegTotal: number;
}): number {
  const { coreScore, dayMode, nonNegCompleted, nonNegTotal } = params;

  switch (dayMode) {
    case 'REST':
      return 100;
    case 'MISSED':
      return 0;
    case 'MINIMUM':
      if (nonNegTotal === 0) return 100;
      return nonNegCompleted === nonNegTotal ? 100 : Math.round((nonNegCompleted / nonNegTotal) * 100);
    case 'NORMAL':
    default:
      return coreScore;
  }
}
