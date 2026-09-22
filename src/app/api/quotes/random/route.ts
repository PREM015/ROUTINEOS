import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const DEFAULT_QUOTES = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Small steps every day create a life you can be proud of.', author: 'Daily Progress' },
  { text: 'You do not need to be perfect. You only need to keep showing up.', author: 'RoutineOS' },
  { text: 'Consistency compounds quietly, but it changes everything.', author: 'Momentum' },
];

const FALLBACK_QUOTE = {
  id: 'default',
  text: 'The secret of getting ahead is getting started.',
  author: 'Mark Twain',
};

const randomQuerySchema = z.object({
  exclude: z.string().min(1).optional(),
  scope: z.enum(['all', 'mine']).optional(),
});

/**
 * GET /api/quotes/random?exclude=<id>&scope=<all|mine>
 * Random quote from system public quotes + all public quotes + the current
 * user's own quotes. Private quotes of other users are never returned.
 * `exclude` skips one id so the widget never repeats twice in a row.
 * Falls back to a built-in quote when the pool is empty.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = randomQuerySchema.safeParse({
      exclude: searchParams.get('exclude') || undefined,
      scope: searchParams.get('scope') || undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { exclude, scope } = validated.data;
    const userId = session.user.id;

    const where =
      scope === 'mine'
        ? { userId }
        : {
            OR: [{ userId }, { isPublic: true }],
          };

    const quotes = await prisma.quote.findMany({
      where,
      select: { id: true, text: true, author: true },
    });

    const pool = exclude ? quotes.filter((q) => q.id !== exclude) : quotes;
    // If excluding emptied a non-empty pool, allow the excluded one again
    // rather than repeating nothing.
    const effective = pool.length > 0 ? pool : quotes;

    if (effective.length === 0) {
      const fallback = DEFAULT_QUOTES[Math.floor(Math.random() * DEFAULT_QUOTES.length)] ?? FALLBACK_QUOTE;
      return NextResponse.json({
        success: true,
        data: { id: 'default', ...fallback },
      });
    }

    const pick = effective[Math.floor(Math.random() * effective.length)] ?? FALLBACK_QUOTE;

    return NextResponse.json({ success: true, data: pick });
  } catch (error) {
    console.error('Error fetching random quote:', error);
    return NextResponse.json({ success: true, data: FALLBACK_QUOTE });
  }
}
