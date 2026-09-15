import { AggregatedUserData } from './aggregator';

export function buildInsightPrompt(data: AggregatedUserData): string {
  return `
Analyze the following user data for the past 30 days and provide personalized insights.
Data:
- Habits Active: ${data.habits.totalActive}
- Average Score: ${data.scores.average}
- Current Streak: ${data.streaks.current} (Longest: ${data.streaks.longest})
- Sleep: ${data.sleep.averageHours} avg hours
- Best day of week: ${data.patterns.bestDayOfWeek}, Worst: ${data.patterns.worstDayOfWeek}
- Active Goals: ${data.goals.active}

Identify patterns, provide specific actionable recommendations, highlight achievements, and give any warnings if they are falling behind.
Return structured JSON only matching the requested schema.
`;
}

export function buildSystemPrompt(): string {
  return `You are an expert productivity and wellness AI coach. Your goal is to analyze user data from their daily planner and habit tracker to provide highly personalized, actionable, and structured insights. Always return valid JSON matching the schema provided.`;
}
