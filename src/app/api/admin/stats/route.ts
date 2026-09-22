import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/stats
 * Get system-wide statistics (admin only)
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Gather system statistics
    const [
      totalUsers,
      activeUsers,
      totalHabits,
      totalGoals,
      totalScores,
      totalInsights,
      usersByRole,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          lastActivityAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.habit.count(),
      prisma.goal.count(),
      prisma.dailyScore.count(),
      prisma.aIInsight.count(),
      prisma.user.groupBy({
        by: ['role'],
        _count: true,
      }),
    ]);

    // Calculate averages
    const avgHabitsPerUser = totalUsers > 0 ? totalHabits / totalUsers : 0;
    const avgGoalsPerUser = totalUsers > 0 ? totalGoals / totalUsers : 0;

    // Get recent activity
    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastActivityAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          byRole: usersByRole.map(r => ({
            role: r.role,
            count: r._count,
          })),
          recent: recentUsers,
        },
        content: {
          habits: {
            total: totalHabits,
            averagePerUser: Math.round(avgHabitsPerUser * 100) / 100,
          },
          goals: {
            total: totalGoals,
            averagePerUser: Math.round(avgGoalsPerUser * 100) / 100,
          },
          scores: {
            total: totalScores,
          },
        },
        ai: {
          totalInsights: totalInsights,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}