import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { UserRepository } from '@/server/repositories/user.repository';
import { adminAnalyticsQuerySchema } from '@/schemas/admin.schema';
import prisma from '@/lib/prisma';

function toDateOnly(value: string): Date {
  const [y = '1970', m = '1', d = '1'] = value.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/**
 * GET /api/admin/analytics
 * System-wide analytics over an optional date range (admin only).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await new UserRepository().findById(session.user.id);
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const validated = adminAnalyticsQuerySchema.safeParse({
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const from = validated.data.from ? toDateOnly(validated.data.from) : undefined;
    const to = validated.data.to ? toDateOnly(validated.data.to) : undefined;
    if (from && to && from > to) {
      return NextResponse.json(
        { error: 'from must be before or equal to to' },
        { status: 400 }
      );
    }

    const createdAtRange = from || to ? { gte: from, lte: to } : undefined;

    const [totalUsers, activeUsers, newUsers, usersByRole, totalHabits, totalGoals, completedGoals, totalFeedback, resolvedFeedback, totalChallenges, activeChallenges, totalScores] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            lastActivityAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
        createdAtRange ? prisma.user.count({ where: { createdAt: createdAtRange } }) : 0,
        prisma.user.groupBy({ by: ['role'], _count: true }),
        prisma.habit.count(),
        prisma.goal.count(),
        prisma.goal.count({
          where: {
            status: 'COMPLETED',
            ...(createdAtRange ? { completedAt: { gte: from, lte: to } } : {}),
          },
        }),
        prisma.feedback.count(),
        prisma.feedback.count({
          where: { status: { in: ['RESOLVED', 'CLOSED'] } },
        }),
        prisma.challenge.count(),
        prisma.challenge.count({ where: { endDate: { gte: new Date() } } }),
        prisma.dailyScore.count(),
      ]);

    return NextResponse.json({
      success: true,
      data: {
        period: { from: validated.data.from ?? null, to: validated.data.to ?? null },
        users: {
          total: totalUsers,
          active30d: activeUsers,
          newInPeriod: newUsers,
          byRole: usersByRole.map((row) => ({ role: row.role, count: row._count })),
        },
        content: {
          habits: totalHabits,
          goals: { total: totalGoals, completed: completedGoals },
          challenges: { total: totalChallenges, active: activeChallenges },
        },
        feedback: { total: totalFeedback, resolved: resolvedFeedback },
        scores: { total: totalScores },
      },
    });
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin analytics' },
      { status: 500 }
    );
  }
}