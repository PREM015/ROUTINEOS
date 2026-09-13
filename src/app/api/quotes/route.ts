import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const DEFAULT_QUOTES = [
  { text: 'The day you plant the tree is not the day you eat the fruit. Be patient, keep watering it, and trust the process.', author: 'Growth Mindset', isPublic: true },
  { text: 'Small steps every day create a life you can be proud of.', author: 'Daily Progress', isPublic: true },
  { text: 'You do not need to be perfect. You only need to keep showing up.', author: 'RoutineOS', isPublic: true },
  { text: 'Consistency compounds quietly, but it changes everything.', author: 'Momentum', isPublic: true },
];

export async function GET() {
  const session = await getServerSession(authOptions);

  try {
    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { isPublic: true },
          ...(session?.user?.id ? [{ userId: session.user.id }] : []),
        ],
      },
      orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
    });

    if (!quotes.length) {
      return NextResponse.json({ success: true, quotes: DEFAULT_QUOTES.map((quote, index) => ({
        id: `default-${index + 1}`,
        userId: 'system',
        ...quote,
      })) });
    }

    return NextResponse.json({ success: true, quotes });
  } catch (error) {
    console.error('GET /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to load quotes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const author = typeof body?.author === 'string' ? body.author.trim() : 'Anonymous';
    const isPublic = Boolean(body?.isPublic);

    if (!text) {
      return NextResponse.json({ error: 'Quote text is required' }, { status: 400 });
    }

    const quote = await prisma.quote.create({
      data: {
        userId: session.user.id,
        text,
        author: author || 'Anonymous',
        isPublic,
      },
    });

    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { isPublic: true },
          { userId: session.user.id },
        ],
      },
      orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, quote, quotes });
  } catch (error) {
    console.error('POST /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to save quote' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const author = typeof body?.author === 'string' ? body.author.trim() : 'Anonymous';
    const isPublic = Boolean(body?.isPublic);

    if (!id) {
      return NextResponse.json({ error: 'Quote id is required' }, { status: 400 });
    }

    const existingQuote = await prisma.quote.findUnique({ where: { id } });
    if (!existingQuote || existingQuote.userId !== session.user.id) {
      return NextResponse.json({ error: 'You can only edit your own quotes.' }, { status: 403 });
    }

    if (!text) {
      return NextResponse.json({ error: 'Quote text is required' }, { status: 400 });
    }

    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        text,
        author: author || 'Anonymous',
        isPublic,
      },
    });

    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { isPublic: true },
          { userId: session.user.id },
        ],
      },
      orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, quote: updatedQuote, quotes });
  } catch (error) {
    console.error('PUT /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to update quote' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';

    if (!id) {
      return NextResponse.json({ error: 'Quote id is required' }, { status: 400 });
    }

    const existingQuote = await prisma.quote.findUnique({ where: { id } });
    if (!existingQuote || existingQuote.userId !== session.user.id) {
      return NextResponse.json({ error: 'You can only delete your own quotes.' }, { status: 403 });
    }

    await prisma.quote.delete({ where: { id } });

    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { isPublic: true },
          { userId: session.user.id },
        ],
      },
      orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, quotes });
  } catch (error) {
    console.error('DELETE /api/quotes error:', error);
    return NextResponse.json({ error: 'Failed to delete quote' }, { status: 500 });
  }
}
