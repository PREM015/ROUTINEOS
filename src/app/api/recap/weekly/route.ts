import { auth } from '@/lib/auth';
import { generateWeeklyRecap } from '@/server/recap/weekly';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let weekStart = searchParams.get('weekStart');
    let weekEnd = searchParams.get('weekEnd');

    // Default to current week
    if (!weekStart || !weekEnd) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      
      const monday = new Date(now.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);

      weekStart = monday.toISOString().slice(0, 10);
      weekEnd = sunday.toISOString().slice(0, 10);
    }

    const recap = await generateWeeklyRecap(session.user.id, weekStart, weekEnd);

    return NextResponse.json({
      success: true,
      data: recap,
    });
  } catch (error) {
    console.error('Error generating weekly recap:', error);
    return NextResponse.json(
      { error: 'Failed to generate recap' },
      { status: 500 }
    );
  }
}