import { PrismaClient } from '@prisma/client';
import { canGenerateInsights, recordInsightGeneration } from './cost-control';
import { aggregateUserDataForAI } from './aggregator';
import { generateInsight } from './provider';
import { AIInsightResponse } from './schema';
import { validateInsightContent, sanitizeInsightText } from './safety';

export async function generateUserInsights(
  userId: string,
  db: PrismaClient
): Promise<{ success: boolean; insights?: AIInsightResponse['insights']; error?: string }> {
  try {
    const { allowed, reason } = await canGenerateInsights(userId, db);
    if (!allowed) {
      return { success: false, error: reason };
    }

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const userData = await aggregateUserDataForAI(userId, startDate, endDate);
    const response = await generateInsight(userData, 'WEEKLY');

    const insights: AIInsightResponse['insights'] = [
      { type: 'pattern', title: 'Weekly summary', summary: response.summary, priority: 'medium' },
      ...response.wins.map<AIInsightResponse['insights'][number]>(
        win => ({ type: 'recommendation', title: 'Win', summary: win, priority: 'low' })
      ),
      ...response.patterns.map<AIInsightResponse['insights'][number]>(
        pattern => ({ type: 'pattern', title: 'Pattern', summary: pattern, priority: 'medium' })
      ),
      ...response.concerns.map<AIInsightResponse['insights'][number]>(
        concern => ({ type: 'warning', title: 'Concern', summary: concern, priority: 'high' })
      ),
      ...response.suggestions.map<AIInsightResponse['insights'][number]>(
        suggestion => ({ type: 'recommendation', title: 'Suggestion', summary: suggestion, priority: 'medium' })
      ),
    ];

    if (!validateInsightContent(insights)) {
      return { success: false, error: 'Insight content failed safety checks' };
    }

    const sanitizedInsights = insights.map(insight => ({
      ...insight,
      title: sanitizeInsightText(insight.title),
      summary: sanitizeInsightText(insight.summary),
      actionable: insight.actionable ? sanitizeInsightText(insight.actionable) : undefined,
    }));

    await recordInsightGeneration(userId, db);

    return { success: true, insights: sanitizedInsights };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating insights',
    };
  }
}