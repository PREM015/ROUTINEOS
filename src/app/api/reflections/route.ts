import { auth } from '@/lib/auth';
import { lifeContextService } from '@/server/services/life-context.service';
import { reflectionSchema } from '@/schemas/reflection.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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

    const data = await lifeContextService.getReflection(userIdFromSession(session), date);

    return NextResponse.json({ success: true, data });
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

    const reflection = await lifeContextService.saveReflection(
      userIdFromSession(session),
      validated.data
    );

    return NextResponse.json({ success: true, data: reflection });
  } catch (error) {
    console.error('Error saving reflection:', error);
    return NextResponse.json(
      { error: 'Failed to save reflection' },
      { status: 500 }
    );
  }
}
