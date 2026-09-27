import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { QuoteService } from '@/server/services/quote.service';
import { z } from 'zod';

const quoteService = new QuoteService();

const createQuoteSchema = z.object({
  text: z.string().trim().min(1, 'Quote text is required').max(280, 'Quote must be 280 characters or less'),
  author: z.string().trim().max(100).optional(),
  isPublic: z.boolean().optional(),
});

const updateQuoteSchema = createQuoteSchema.extend({
  id: z.string().min(1, 'Quote id is required'),
});

const deleteQuoteSchema = z.object({
  id: z.string().min(1, 'Quote id is required'),
});

/**
 * GET /api/quotes — quotes visible to the user (public + own).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const quotes = await quoteService.listQuotes(session.user.id);
    return NextResponse.json({ success: true, data: quotes });
  } catch (error) {
    console.error('GET /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to load quotes' }, { status: 500 });
  }
}

/**
 * POST /api/quotes — create an own quote (private by default).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const validated = createQuoteSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const result = await quoteService.createQuote(session.user.id, validated.data);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('POST /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to save quote' }, { status: 500 });
  }
}

/**
 * PUT /api/quotes — edit an own quote. Only the owner may edit.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const validated = updateQuoteSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...input } = validated.data;
    const result = await quoteService.updateQuote(session.user.id, id, input);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('You can only')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('PUT /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to update quote' }, { status: 500 });
  }
}

/**
 * DELETE /api/quotes — delete an own quote. Only the owner may delete.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const validated = deleteQuoteSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const result = await quoteService.deleteQuote(session.user.id, validated.data.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('You can only')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('DELETE /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to delete quote' }, { status: 500 });
  }
}
