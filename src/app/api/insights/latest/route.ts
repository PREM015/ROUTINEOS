import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') as 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;

    const where: any = { userId: session.user.id };
    if (period) {
      where.period = period;
    }

    const insight = await prisma.aIInsight.findFirst({
      where,
      orderBy: { generatedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: insight,
    });
  } catch (error) {
    console.error('Error fetching latest insight:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insight' },
      { status: 500 }
    );
  }
}