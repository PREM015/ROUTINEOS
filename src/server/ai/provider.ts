import OpenAI from 'openai';
import { buildInsightPrompt } from './prompt';
import { z } from 'zod';

/**
 * AI Provider
 * OpenAI integration for insight generation
 */

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

const insightSchema = z.object({
  summary: z.string(),
  wins: z.array(z.string()),
  patterns: z.array(z.string()),
  concerns: z.array(z.string()),
  suggestions: z.array(z.string()),
  nextPeriodFocus: z.string(),
});

export async function generateInsight(
  data: any,
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY'
): Promise<{
  summary: string;
  wins: string[];
  patterns: string[];
  concerns: string[];
  suggestions: string[];
  nextPeriodFocus: string;
  tokensUsed: number;
  model: string;
}> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = buildInsightPrompt(data, period);

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful productivity coach. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from AI');
    }

    // Parse and validate response
    const parsed = JSON.parse(responseText);
    const validated = insightSchema.parse(parsed);

    return {
      ...validated,
      tokensUsed: completion.usage?.total_tokens || 0,
      model: completion.model,
    };
  } catch (error) {
    console.error('AI generation error:', error);
    throw new Error('Failed to generate AI insight');
  }
}

/**
 * Calculate cost estimate
 */
export function estimateCost(tokensUsed: number, model: string): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4-turbo-preview': { input: 0.01, output: 0.03 }, // per 1K tokens
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  };

  const defaultPricing = { input: 0.0005, output: 0.0015 };
  const modelPricing = pricing[model] ?? defaultPricing;
  
  // Assume 50/50 split for simplicity
  const inputTokens = tokensUsed / 2;
  const outputTokens = tokensUsed / 2;

  const cost =
    (inputTokens / 1000) * modelPricing.input +
    (outputTokens / 1000) * modelPricing.output;

  return cost;
}