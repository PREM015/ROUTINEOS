import { z } from 'zod';
import { HabitTier, HabitFrequencyType, HabitStatus } from '@/generated/prisma/client';

export const CreateHabitSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  tier: z.nativeEnum(HabitTier),           // ✅ Use Prisma enum
  frequencyType: z.nativeEnum(HabitFrequencyType), // ✅ Fixed
  frequencyValue: z.string().optional(),
  targetCount: z.number().int().positive().optional(),
  categoryId: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  reminderTime: z.string().optional(),
  reminderEnabled: z.boolean().default(false),
  points: z.number().optional(),
  estimatedDuration: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export const UpdateHabitSchema = CreateHabitSchema.partial().extend({
  status: z.nativeEnum(HabitStatus).optional(),
});

export const LogHabitSchema = z.object({
  habitId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['COMPLETED', 'MISSED', 'SKIPPED', 'NOT_APPLICABLE', 'PARTIAL']),
  quantity: z.number().int().positive().optional(),
  durationMinutes: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  note: z.string().optional(),
});