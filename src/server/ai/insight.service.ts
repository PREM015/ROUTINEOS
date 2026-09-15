import { PrismaClient } from '@prisma/client';
import { canGenerateInsights, recordInsightGeneration } from './cost-control';
import { aggregateUserData } from './aggregator';
import { buildInsightPrompt, buildSystemPrompt } from './prompt';
import { generateInsights } from './provider';
import { AIInsightSchema } from './schema';
import { validateInsightContent, sanitizeInsightText } from './safety';

export async function generateUserInsights(userId: string, db: PrismaClient): Promise<{ success: boolean; insights?: any[]; error?: string }> {
  try {
    const { allowed, reason } = await canGenerateInsights(userId, db);
    if (!allowed) {
      return { success: false, error: reason };
    }

    const userData = await aggregateUserData(userId, db);
    const prompt = buildInsightPrompt(userData);
    const systemPrompt = buildSystemPrompt();

    const rawResponse = await generateInsights(prompt, systemPrompt);
    
    // clean up response if it has markdown json block
    const cleanedJsonStr = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedJsonStr);
    
    const validatedData = AIInsightSchema.parse(parsedData);

    if (!validateInsightContent(validatedData.insights)) {
      return { success: false, error: 'Insight content failed safety checks' };
    }

    const sanitizedInsights = validatedData.insights.map(insight => ({
      ...insight,
      summary: sanitizeInsightText(insight.summary),
      title: sanitizeInsightText(insight.title),
      actionable: insight.actionable ? sanitizeInsightText(insight.actionable) : undefined
    }));

    await recordInsightGeneration(userId, db);

    return { success: true, insights: sanitizedInsights };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error generating insights' };
  }
}
