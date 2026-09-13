import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  try {
    const score = await prisma.dailyScore.findUnique({
      where: { 
        userId_date: {
          userId: session.user.id,
          date
        }
      }
    });
    return NextResponse.json({ success: true, data: score });
  } catch (error) {
    console.error("GET /api/scores/daily error:", error);
    return NextResponse.json({ success: false, error: 'Failed to fetch score' }, { status: 500 });
  }
}
