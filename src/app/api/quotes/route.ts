import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const DEFAULT_QUOTES = [
  { text: 'The day you plant the tree is not the day you eat the fruit. Be patient, keep watering it, and trust the process.', author: 'Growth Mindset', isPublic: true },
  { text: 'Small steps every day create a life you can be proud of.', author: 'Daily Progress', isPublic: true },
  { text: 'You do not need to be perfect. You only need to keep showing up.', author: 'RoutineOS', isPublic: true },
  { text: 'Consistency compounds quietly, but it changes everything.', author: 'Momentum', isPublic: true },
];     

const createQuoteSchema = z.object({
  text: z.string().trim().min(1, 'Quote text is required').max(280, 'Quote must be 280 characters or less'),
  author: z.string().trim().max(100).optional(),
  isPublic: z.boolean().optional(),
});

const updateQuoteSchema = z.object({
  id: z.string().min(1, 'Quote id is required'),
  text: z.string().trim().min(1, 'Quote text is required').max(280, 'Quote must be 280 characters or less'),
  author: z.string().trim().max(100).optional(),
  isPublic: z.boolean().optional(),
});

const deleteQuoteSchema = z.object({
  id: z.string().min(1, 'Quote id is required'),
});

function visibleWhere(userId: string) {
  return {
    OR: [{ isPublic: true }, { userId }],
  };
}

/**
 * GET /api/quotes — quotes visible to the user (public + own).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const quotes = await prisma.quote.findMany({
      where: visibleWhere(session.user.id),
      orderBy: [{ createdAt: 'desc' }],
    });

    if (!quotes.length) {
      return NextResponse.json({
        success: true,
        data: DEFAULT_QUOTES.map((quote, index) => ({
          id: `default-${index + 1}`,
          userId: 'system',
          ...quote,
        })),
      });
    }

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

    const quote = await prisma.quote.create({
      data: {
        userId: session.user.id,
        text: validated.data.text,
        author: validated.data.author?.trim() ? validated.data.author.trim() : 'Anonymous',
        isPublic: validated.data.isPublic ?? false,
      },
    });

    const quotes = await prisma.quote.findMany({
      where: visibleWhere(session.user.id),
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, data: { quote, quotes } }, { status: 201 });
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

    const existingQuote = await prisma.quote.findUnique({ where: { id: validated.data.id } });
    if (!existingQuote || existingQuote.userId !== session.user.id) {
      return NextResponse.json({ error: 'You can only edit your own quotes.' }, { status: 403 });
    }

    const updatedQuote = await prisma.quote.update({
      where: { id: validated.data.id },
      data: {
        text: validated.data.text,
        author: validated.data.author?.trim() ? validated.data.author.trim() : 'Anonymous',
        isPublic: validated.data.isPublic ?? existingQuote.isPublic,
      },
    });

    const quotes = await prisma.quote.findMany({
      where: visibleWhere(session.user.id),
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, data: { quote: updatedQuote, quotes } });
  } catch (error) {
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

    const existingQuote = await prisma.quote.findUnique({ where: { id: validated.data.id } });
    if (!existingQuote || existingQuote.userId !== session.user.id) {
      return NextResponse.json({ error: 'You can only delete your own quotes.' }, { status: 403 });
    }

    await prisma.quote.delete({ where: { id: validated.data.id } });

    const quotes = await prisma.quote.findMany({
      where: visibleWhere(session.user.id),
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, data: { quotes } });
  } catch (error) {
    console.error('DELETE /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to delete quote' }, { status: 500 });
  }
}
