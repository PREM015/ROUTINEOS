import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { celebrateAchievementSchema } from '@/schemas/achievement.schema';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import prisma from '@/lib/prisma';

/**
 * POST /api/achievements/celebrate
 * Celebrate a streak milestone or an unlocked achievement for the user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = celebrateAchievementSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const auditRepository = new AuditRepository();

    if (validated.data.milestoneId) {
      const milestone = await prisma.streakMilestone.findFirst({
        where: { id: validated.data.milestoneId, userId },
      });
      if (!milestone) {
        return NextResponse.json({ error: 'Streak milestone not found' }, { status: 404 });
      }

      const updated = await new StreakRepository().celebrateMilestone(milestone.id);

      await auditRepository.createActivity({
        userId,
        action: 'MILESTONE_CELEBRATED',
        entityType: 'streakMilestone',
        entityId: milestone.id,
        description: `Celebrated ${milestone.milestoneDays}-day streak milestone`,
      });

      return NextResponse.json({
        success: true,
        data: { type: 'milestone', milestone: updated },
      });
    }

    const achievementId = validated.data.achievementId as string;
    const achievement = await new AchievementRepository().findById(userId, achievementId);
    if (!achievement) {
      return NextResponse.json({ error: 'Achievement not found' }, { status: 404 });
    }

    await auditRepository.createActivity({
      userId,
      action: 'ACHIEVEMENT_CELEBRATED',
      entityType: 'achievement',
      entityId: achievement.id,
      description: `Celebrated achievement: ${achievement.title}`,
    });

    return NextResponse.json({
      success: true,
      data: { type: 'achievement', achievement },
    });
  } catch (error) {
    console.error('Error celebrating achievement:', error);
    return NextResponse.json(
      { error: 'Failed to celebrate achievement' },
      { status: 500 }
    );
  }
}