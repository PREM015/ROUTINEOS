import OpenAI from 'openai';
import { buildInsightPrompt } from './prompt';
import { z } from 'zod';

/**
 * AI Provider
 * OpenAI integration for insight generation.
 *
 * OpenAI is optional.
 * The application can build and run without OPENAI_API_KEY.
 */

let openai: OpenAI | null = null;

/**
 * Get the OpenAI client only when it is actually needed.
 * This prevents the Vercel build from failing when no API key exists.
 */
function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey,
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

export type GeneratedInsight = {
  summary: string;
  wins: string[];
  patterns: string[];
  concerns: string[];
  suggestions: string[];
  nextPeriodFocus: string;
  tokensUsed: number;
  model: string;
};

/**
 * Generate an AI insight from user productivity data.
 *
 * AI is optional. If OPENAI_API_KEY is not configured,
 * this function throws a controlled error only when
 * an AI insight is actually requested.
 */
export async function generateInsight(
  data: any,
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY'
): Promise<GeneratedInsight> {
  const prompt = buildInsightPrompt(data, period);

  try {
    const client = getOpenAI();

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful productivity coach. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: {
        type: 'json_object',
      },
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      throw new Error('No response from AI');
    }

    // Parse and validate AI response
    const parsed = JSON.parse(responseText);
    const validated = insightSchema.parse(parsed);

    return {
      ...validated,
      tokensUsed: completion.usage?.total_tokens ?? 0,
      model: completion.model,
    };
  } catch (error) {
    console.error('AI generation error:', error);

    if (
      error instanceof Error &&
      error.message === 'OpenAI API key not configured'
    ) {
      throw error;
    }

    throw new Error('Failed to generate AI insight');
  }
}

/**
 * Calculate estimated AI cost.
 *
 * Pricing is expressed per 1K tokens.
 */
export function estimateCost(
  tokensUsed: number,
  model: string
): number {
  const pricing: Record<
    string,
    {
      input: number;
      output: number;
    }
  > = {
    'gpt-4-turbo-preview': {
      input: 0.01,
      output: 0.03,
    },
    'gpt-3.5-turbo': {
      input: 0.0005,
      output: 0.0015,
    },
  };

  const defaultPricing = {
    input: 0.0005,
    output: 0.0015,
  };

  const modelPricing = pricing[model] ?? defaultPricing;

  // Assume a 50/50 input/output token split.
  const inputTokens = tokensUsed / 2;
  const outputTokens = tokensUsed / 2;

  const cost =
    (inputTokens / 1000) * modelPricing.input +
    (outputTokens / 1000) * modelPricing.output;

  return cost;
}