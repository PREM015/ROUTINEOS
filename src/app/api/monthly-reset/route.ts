import { auth } from '@/lib/auth';
import { reviewService } from '@/server/services/review.service';
import { createMonthlyResetSchema } from '@/lib/validation/review.schema';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    // The shared schema in `lib/validation/review.schema` is the real
    // contract. This route previously carried a second, weaker inline copy that
    // typed `tier`/`frequencyType` as bare strings and skipped the cuid checks,
    // so invalid input reached the service unvalidated.
    const validated = createMonthlyResetSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // Archiving dropped habits, applying goal decisions and recording the reset
    // are all service concerns.
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
