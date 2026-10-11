import { auth } from '@/lib/auth';
import { reviewService } from '@/server/services/review.service';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const weeklyReviewSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  answers: z.record(z.string()),
  biggestWins: z.string().optional(),
  challenges: z.string().optional(),
  lessonsLearned: z.string().optional(),
  nextWeekFocus: z.string().optional(),
  nextWeekGoals: z.array(z.string()).optional(),
  overallSatisfaction: z.number().int().min(1).max(5).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  stressLevel: z.number().int().min(1).max(5).optional(),
});

/**
 * GET /api/weekly-review
 * Get a week's review (generating recap stats when none exists yet).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get('weekStart');

    if (!weekStart) {
      return NextResponse.json(
        { error: 'weekStart parameter required' },
        { status: 400 }
      );
    }

    const result = await reviewService.getWeeklyReview(userIdFromSession(session), weekStart);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/weekly-review
 * Create or update a weekly review.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = weeklyReviewSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const review = await reviewService.saveWeeklyReview(
      userIdFromSession(session),
      validated.data
    );

    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    return handleError(error);
  }
}
