import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateWeeklyRecap } from '@/server/recap/weekly';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
 * Get weekly review
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

    const review = await prisma.weeklyReview.findFirst({
      where: {
        userId: session.user.id,
        weekStart,
      },
    });

    // If no review exists, generate recap data
    if (!review) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const recap = await generateWeeklyRecap(
        session.user.id,
        weekStart,
        weekEnd.toISOString().split('T')[0]
      );

      return NextResponse.json({
        success: true,
        data: {
          review: null,
          recap,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        review,
        recap: review.statsSnapshot ? JSON.parse(review.statsSnapshot) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching weekly review:', error);
    return NextResponse.json(
      { error: 'Failed to fetch review' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/weekly-review
 * Create or update weekly review
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

    const { weekStart, weekEnd, ...reviewData } = validated.data;

    // Generate recap stats
    const recap = await generateWeeklyRecap(session.user.id, weekStart, weekEnd);

    const review = await prisma.weeklyReview.upsert({
      where: {
        userId_weekStart: {
          userId: session.user.id,
          weekStart,
        },
      },
      create: {
        userId: session.user.id,
        weekStart,
        weekEnd,
        statsSnapshot: JSON.stringify(recap),
        answers: JSON.stringify(reviewData.answers),
        biggestWins: reviewData.biggestWins,
        challenges: reviewData.challenges,
        lessonsLearned: reviewData.lessonsLearned,
        nextWeekFocus: reviewData.nextWeekFocus,
        nextWeekGoals: reviewData.nextWeekGoals ? JSON.stringify(reviewData.nextWeekGoals) : null,
        overallSatisfaction: reviewData.overallSatisfaction,
        energyLevel: reviewData.energyLevel,
        stressLevel: reviewData.stressLevel,
      },
      update: {
        answers: JSON.stringify(reviewData.answers),
        biggestWins: reviewData.biggestWins,
        challenges: reviewData.challenges,
        lessonsLearned: reviewData.lessonsLearned,
        nextWeekFocus: reviewData.nextWeekFocus,
        nextWeekGoals: reviewData.nextWeekGoals ? JSON.stringify(reviewData.nextWeekGoals) : null,
        overallSatisfaction: reviewData.overallSatisfaction,
        energyLevel: reviewData.energyLevel,
        stressLevel: reviewData.stressLevel,
      },
    });

    return NextResponse.json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error('Error saving weekly review:', error);
    return NextResponse.json(
      { error: 'Failed to save review' },
      { status: 500 }
    );
  }
}