import { auth } from '@/lib/auth';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const reflectionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  energy: z.number().int().min(1).max(5).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  stress: z.number().int().min(1).max(5).optional(),
  focus: z.number().int().min(1).max(5).optional(),
  reflectionText: z.string().optional(),
  biggestWin: z.string().optional(),
  biggestDifficulty: z.string().optional(),
  lessonsLearned: z.string().optional(),
  gratitude: z.string().optional(),
  improvements: z.string().optional(),
  tomorrowFocus: z.string().optional(),
});

/**
 * GET /api/reflections
 * Get daily reflection
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter required' },
        { status: 400 }
      );
    }

    const reflectionRepository = new ReflectionRepository();
    const reflection = await reflectionRepository.findByDate(
      session.user.id,
      date
    );

    return NextResponse.json({
      success: true,
      data: reflection,
    });
  } catch (error) {
    console.error('Error fetching reflection:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reflection' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reflections
 * Create or update daily reflection
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = reflectionSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { date, ...reflectionData } = validated.data;

    const reflectionRepository = new ReflectionRepository();
    const reflection = await reflectionRepository.upsertReflection(
      session.user.id,
      date,
      reflectionData
    );

    return NextResponse.json({
      success: true,
      data: reflection,
    });
  } catch (error) {
    console.error('Error saving reflection:', error);
    return NextResponse.json(
      { error: 'Failed to save reflection' },
      { status: 500 }
    );
  }
}