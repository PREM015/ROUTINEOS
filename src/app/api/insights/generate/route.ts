import { auth } from '@/lib/auth';
import { insightGenerationService } from '@/server/services/insight.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

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

    const result = await insightGenerationService.generate(userIdFromSession(session), {
      period: validated.data.period,
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
    });

    return NextResponse.json({
      success: true,
      data: result.insight,
      cached: result.cached,
      cost: result.cost,
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
