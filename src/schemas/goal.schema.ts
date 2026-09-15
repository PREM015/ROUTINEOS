import { z } from 'zod';
import { GoalType, GoalPriority, GoalStatus } from '@/generated/prisma/client';

export const CreateGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.nativeEnum(GoalType),           // ✅ Use Prisma enum
  priority: z.nativeEnum(GoalPriority),   // ✅ Fixed
  status: z.nativeEnum(GoalStatus).default('ACTIVE'), // ✅ Fixed
  targetValue: z.number().positive(),
  currentValue: z.number().default(0),
  unit: z.string().optional(),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  projectId: z.string().optional(),
  parentGoalId: z.string().optional(),
});

export const UpdateGoalSchema = CreateGoalSchema.partial();

export const LogProgressSchema = z.object({
  goalId: z.string(),
  value: z.number(),
  note: z.string().optional(),
});

export const CarryOverSchema = z.object({
  goalId: z.string(),
  newEndDate: z.string().or(z.date()),
});