export type ScoreBand = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreBandConfig {
  band: ScoreBand;
  label: string;
  color: string;
  emoji: string;
  minScore: number;
}

export const SCORE_BANDS: ScoreBandConfig[] = [
  { band: 'S', label: 'Outstanding', color: 'text-purple-500', emoji: '🌟', minScore: 95 },
  { band: 'A', label: 'Excellent', color: 'text-blue-500', emoji: '🔥', minScore: 85 },
  { band: 'B', label: 'Good', color: 'text-green-500', emoji: '✨', minScore: 70 },
  { band: 'C', label: 'Fair', color: 'text-yellow-500', emoji: '👍', minScore: 50 },
  { band: 'D', label: 'Poor', color: 'text-orange-500', emoji: '⚠️', minScore: 30 },
  { band: 'F', label: 'Missed', color: 'text-red-500', emoji: '❌', minScore: 0 },
];

export function getScoreBand(score: number): ScoreBand {
  for (const band of SCORE_BANDS) {
    if (score >= band.minScore) return band.band;
  }
  return 'F';
}

export function getScoreBandConfig(band: ScoreBand): ScoreBandConfig {
  return SCORE_BANDS.find(b => b.band === band) || SCORE_BANDS[5];
}

export function getScoreBandLabel(score: number): string {
  return getScoreBandConfig(getScoreBand(score)).label;
}

export function getScoreBandColor(score: number): string {
  return getScoreBandConfig(getScoreBand(score)).color;
}

export function getScoreBandEmoji(score: number): string {
  return getScoreBandConfig(getScoreBand(score)).emoji;
}
