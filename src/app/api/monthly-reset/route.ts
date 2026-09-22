import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const monthlyResetSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  habitsToKeep: z.array(z.string()).optional(),
  habitsToRemove: z.array(z.string()).optional(),
  habitsToModify: z.array(z.object({
    habitId: z.string(),
    changes: z.record(z.any()),
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

    const habitRepository = new HabitRepository();

    // Archive habits marked for removal
    if (validated.data.habitsToRemove) {
      await Promise.all(
        validated.data.habitsToRemove.map(habitId =>
          habitRepository.archive(habitId, session.user.id)
        )
      );
    }

    // Create monthly reset record
    const reset = await prisma.monthlyReset.create({
      data: {
        userId: session.user.id,
        month: validated.data.month,
        habitsToKeep: validated.data.habitsToKeep ? JSON.stringify(validated.data.habitsToKeep) : null,
        habitsToRemove: validated.data.habitsToRemove ? JSON.stringify(validated.data.habitsToRemove) : null,
        habitsToModify: validated.data.habitsToModify ? JSON.stringify(validated.data.habitsToModify) : null,
        newHabitsToAdd: validated.data.newHabitsToAdd ? JSON.stringify(validated.data.newHabitsToAdd) : null,
        goalsCompleted: validated.data.goalsCompleted ? JSON.stringify(validated.data.goalsCompleted) : null,
        goalsInProgress: validated.data.goalsInProgress ? JSON.stringify(validated.data.goalsInProgress) : null,
        goalsReviewNotes: validated.data.goalsReviewNotes,
        nextMonthPriorities: validated.data.nextMonthPriorities ? JSON.stringify(validated.data.nextMonthPriorities) : null,
        nextMonthGoals: validated.data.nextMonthGoals ? JSON.stringify(validated.data.nextMonthGoals) : null,
        nextMonthFocus: validated.data.nextMonthFocus,
        monthHighlights: validated.data.monthHighlights,
        monthChallenges: validated.data.monthChallenges,
        overallSatisfaction: validated.data.overallSatisfaction,
        personalGrowth: validated.data.personalGrowth,
        goalProgress: validated.data.goalProgress,
      },
    });

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