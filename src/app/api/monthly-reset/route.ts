import { auth } from '@/lib/auth';
import { reviewService } from '@/server/services/review.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const monthlyResetSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  habitsToKeep: z.array(z.string()).optional(),
  habitsToRemove: z.array(z.string()).optional(),
  habitsToModify: z.array(z.object({
    habitId: z.string(),
    changes: z.record(z.unknown()),
  })).optional(),
  newHabitsToAdd: z.array(z.object({
    name: z.string(),
    tier: z.string(),
    frequencyType: z.string(),
  })).optional(),
  goalsCompleted: z.array(z.string()).optional(),
  goalsInProgress: z.array(z.string()).optional(),
  goalsReviewNotes: z.string().optional(),
  nextMonthPriorities: z.array(z.string()).optional(),
  nextMonthGoals: z.array(z.object({
    title: z.string(),
    targetValue: z.number(),
    unit: z.string().optional(),
  })).optional(),
  nextMonthFocus: z.string().optional(),
  monthHighlights: z.string().optional(),
  monthChallenges: z.string().optional(),
  overallSatisfaction: z.number().int().min(1).max(5).optional(),
  personalGrowth: z.number().int().min(1).max(5).optional(),
  goalProgress: z.number().int().min(1).max(5).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = monthlyResetSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // Archiving dropped habits and recording the reset are both service concerns.
    const reset = await reviewService.createMonthlyReset(
      session.user.id,
      validated.data
    );

    return NextResponse.json({
      success: true,
      data: reset,
    });
  } catch (error) {
    console.error('Error creating monthly reset:', error);
    return NextResponse.json(
      { error: 'Failed to create monthly reset' },
      { status: 500 }
    );
  }
}
