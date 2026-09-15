/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { createAuthHandler } from "@/lib/middleware/api-handler";
import { db } from "@/lib/db";
import { z } from "zod";

const createHabitSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  tier: z.enum(['GROWTH', 'BONUS', 'OPTIONAL', 'EXPERIMENTAL', 'UNDEFINED', 'ALTERNATIVE', 'SPECIAL', 'FLEXIBLE', 'JUST_FOR_FUN', 'LIFESTYLE']),
  frequencyType: z.enum(['DAILY', 'SPECIFIC_WEEKDAYS', 'WEEKLY_TARGET', 'MONTHLY_TARGET', 'YEARLY_TARGET', 'RANDOM', 'ONE_TIME', 'CUSTOM']),
  frequencyValue: z.string().optional(),
  targetCount: z.number().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  reminderTime: z.string().optional(),
  reminderEnabled: z.boolean().default(false),
  estimatedDuration: z.number().optional(),
  difficulty: z.number().min(1).max(5).optional(),
});

export const GET = createAuthHandler(async (req, { session }) => {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const status = searchParams.get("status");

  const where: any = { userId: session.user.id };
  if (status) where.status = status;

  const habits = await db.habit.findMany({
    where,
    include: {
      logs: date ? { where: { date } } : false,
      overrides: date 
        ? { 
            where: { 
              startDate: { lte: date }, 
              OR: [
                { endDate: null }, 
                { endDate: { gte: date } }
              ] 
            } 
          } 
        : false,
      category: true,
      tags: {
        include: {
          tag: true,
        },
      },
    },
    orderBy: [
      { status: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  return habits;
});

export const POST = createAuthHandler(
  async (req, { session, body }) => {
    const habit = await db.habit.create({
      data: {
        ...body,
        userId: session.user.id,
        status: 'ACTIVE',
        startDate: new Date(),
      },
      include: { 
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    return habit;
  },
  createHabitSchema
);