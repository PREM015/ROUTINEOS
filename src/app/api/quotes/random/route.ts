import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { QuoteService, FALLBACK_QUOTE } from '@/server/services/quote.service';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const quoteService = new QuoteService();

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

    const pick = await quoteService.getRandomQuote(userIdFromSession(session), {
      exclude: validated.data.exclude,
      scope: validated.data.scope,
    });

    return NextResponse.json({ success: true, data: pick });
  } catch {
    // Never surface an error to the widget — it is decorative.
    console.error('Error fetching random quote');
    return NextResponse.json({ success: true, data: FALLBACK_QUOTE });
  }
}
