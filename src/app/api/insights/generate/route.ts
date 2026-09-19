import { auth } from '@/lib/auth';
import { aggregateUserDataForAI, validateDataSize } from '@/server/ai/aggregator';
import { generateInsight, estimateCost } from '@/server/ai/provider';
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const generateInsightSchema = z.object({
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if AI is enabled
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'AI insights not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const validated = generateInsightSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { period, startDate, endDate } = validated.data;

    // Check for existing insight
    const existing = await prisma.aIInsight.findFirst({
      where: {
        userId: session.user.id,
        period,
        startDate,
        endDate,
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: existing,
        cached: true,
      });
    }

    // Aggregate data
    const data = await aggregateUserDataForAI(session.user.id, startDate, endDate);

    // Validate data size
    const validation = validateDataSize(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Data too large: ${validation.size.toFixed(2)}KB (max 50KB)` },
        { status: 400 }
      );
    }

    // Generate insight
    const insight = await generateInsight(data, period);

    // Calculate cost
    const cost = estimateCost(insight.tokensUsed, insight.model);

    // Save insight
    const saved = await prisma.aIInsight.create({
      data: {
        userId: session.user.id,
        period,
        startDate,
        endDate,
        dataSnapshot: JSON.stringify(data),
        model: insight.model,
        tokensUsed: insight.tokensUsed,
        summary: insight.summary,
        wins: insight.wins.join('\n'),
        patterns: insight.patterns.join('\n'),
        concerns: insight.concerns.join('\n'),
        suggestions: insight.suggestions.join('\n'),
        nextPeriodFocus: insight.nextPeriodFocus,
      },
    });

    return NextResponse.json({
      success: true,
      data: saved,
      cost: cost.toFixed(4),
    });
  } catch (error) {
    console.error('Error generating insight:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to generate insight' },
      { status: 500 }
    );
  }
}