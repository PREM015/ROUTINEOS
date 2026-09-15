
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAuthHandler } from '@/lib/middleware/api-handler';
import { db } from '@/lib/db';
import { z } from 'zod';

const createGoalSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'PERSONAL', 'ACADEMIC', 'NON_PROFIT', 'PROFESSIONAL']),
  targetValue: z.number().positive(),
  currentValue: z.number().default(0),
  unit: z.string().optional(),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  projectId: z.string().optional(),
  parentGoalId: z.string().optional(),
});

export const GET = createAuthHandler(async (req, { session }) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const priority = searchParams.get('priority');
  const projectId = searchParams.get('projectId');

  const where: any = { userId: session.user.id };
  if (status) where.status = status;
  if (type) where.type = type;
  if (priority) where.priority = priority;
  if (projectId) where.projectId = projectId;

  const goals = await db.goal.findMany({
    where,
    include: {
      project: true,
      parentGoal: true,
      subGoals: {
        select: {
          id: true,
          title: true,
          status: true,
          currentValue: true,
          targetValue: true,
        },
      },
      milestones: {
        orderBy: { sortOrder: 'asc' },
      },
      tags: {
        include: {
          tag: true,
        },
      },
      _count: {
        select: { 
          progressLogs: true,
          subGoals: true,
        },
      },
    },
    orderBy: [
      { status: 'asc' },
      { endDate: 'asc' },
    ],
  });

  return goals;
});

export const POST = createAuthHandler(
  async (req, { session, body }) => {
    const goal = await db.goal.create({
      data: {
        ...body,
        userId: session.user.id,
        status: 'ACTIVE',
        currentValue: body.currentValue || 0,
      },
      include: { 
        project: true,
        parentGoal: true,
        milestones: true,
      },
    });

    return goal;
  },
  createGoalSchema
);