import { z } from 'zod';
import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { NextRequest, NextResponse } from 'next/server';

const goalFilterSchema = z.object({
  type: z
    .array(z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']))
    .optional(),
  status: z
    .array(z.enum(['ACTIVE', 'COMPLETED', 'MISSED', 'CARRIED_OVER', 'ON_HOLD', 'CANCELLED']))
    .optional(),
  priority: z
    .array(
      z.enum([
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL',
        'PERSONAL',
        'ACADEMIC',
        'NON_PROFIT',
        'PROFESSIONAL',
      ])
    )
    .optional(),
  timeline: z.enum(['all', 'active', 'completed', 'cancelled', 'overdue', 'dueSoon']).optional(),
  projectId: z.string().cuid().optional(),
  parentGoalId: z.string().cuid().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['title', 'endDate', 'priority', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

/**
 * GET /api/filter/goals
 * Filter the authenticated user's goals by type, status, priority and timeline
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const queryData = {
      type: searchParams.get('type')?.split(','),
      status: searchParams.get('status')?.split(','),
      priority: searchParams.get('priority')?.split(','),
      timeline: searchParams.get('timeline') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      parentGoalId: searchParams.get('parentGoalId') || undefined,
      search: searchParams.get('search') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    const validated = goalFilterSchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goals = await new GoalService().filterGoals(session.user.id, validated.data);

    return NextResponse.json({
      success: true,
      data: goals,
      meta: {
        total: goals.length,
        limit: validated.data.limit,
        offset: validated.data.offset,
      },
    });
  } catch (error) {
    console.error('Error filtering goals:', error);
    return NextResponse.json({ error: 'Failed to filter goals' }, { status: 500 });
  }
}
