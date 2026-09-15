export interface ScoreSnapshot {
  nonNegCompleted: number;
  nonNegTotal: number;
  growthCompleted: number;
  growthTotal: number;
  bonusCompleted: number;
  bonusTotal: number;
  coreScore: number;
  overallScore: number;
  dayMode: string;
}

export function createScoreSnapshot(params: ScoreSnapshot): ScoreSnapshot {
  return { ...params };
}

export function snapshotToJSON(snapshot: ScoreSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseSnapshot(json: string): ScoreSnapshot {
  return JSON.parse(json);
}
