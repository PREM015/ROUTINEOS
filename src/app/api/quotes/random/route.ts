import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get random quote from user's quotes or public quotes
    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { userId: session.user.id },
          { isPublic: true },
        ],
      },
      select: {
        id: true,
        text: true,
        author: true,
      },
    });

    if (quotes.length === 0) {
      // Return default quote
      return NextResponse.json({
        success: true,
        data: {
          id: 'default',
          text: 'The secret of getting ahead is getting started.',
          author: 'Mark Twain',
        },
      });
    }

    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

    return NextResponse.json({
      success: true,
      data: randomQuote,
    });
  } catch (error) {
    console.error('Error fetching random quote:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}