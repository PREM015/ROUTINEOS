import { auth } from '@/lib/auth';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import { reflectionSchema } from '@/schemas/reflection.schema';
import { NextRequest, NextResponse } from 'next/server';

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

    const { date, gratitude, tomorrowPriorities, ...reflectionData } = validated.data;

    const reflectionRepository = new ReflectionRepository();
    const reflection = await reflectionRepository.upsertReflection(
      session.user.id,
      date,
      {
        ...reflectionData,
        // DB columns are String (JSON arrays) — serialize, never store raw arrays.
        gratitude: Array.isArray(gratitude)
          ? JSON.stringify(gratitude)
          : (gratitude ?? undefined),
        tomorrowPriorities: Array.isArray(tomorrowPriorities)
          ? JSON.stringify(tomorrowPriorities)
          : undefined,
      }
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