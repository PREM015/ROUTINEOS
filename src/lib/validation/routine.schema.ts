import { z } from 'zod';
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  CreateBlockSchema,
  UpdateBlockSchema,
  CreateExceptionSchema,
  LogBlockSchema,
} from '@/schemas/routine.schema';

export {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  CreateBlockSchema,
  UpdateBlockSchema,
  CreateExceptionSchema,
  LogBlockSchema,
};

export const createRoutineTemplateSchema = z.object({
  name: CreateTemplateSchema.shape.name,
  description: CreateTemplateSchema.shape.description,
  dayType: z.enum(['WORKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM']).optional(),
  isDefault: CreateTemplateSchema.shape.isDefault,
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  icon: z.string().optional(),
  blocks: z.array(CreateBlockSchema).optional(),
});

export const updateRoutineTemplateSchema = createRoutineTemplateSchema.partial().extend({
  id: z.string().min(1, 'Template ID is required'),
});

export const routineTemplateQuerySchema = z.object({
  dayType: z.enum(['WORKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM']).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'dayType']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const logRoutineBlockSchema = z.object({
  routineBlockId: z.string().min(1, 'Routine block ID is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  status: z.enum(['COMPLETED', 'MISSED', 'PARTIAL', 'IN_PROGRESS']),
  actualStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  actualEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  focusRating: z.number().int().min(1).max(5).optional(),
  productivityRating: z.number().int().min(1).max(5).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  note: z.string().max(2000).optional(),
});

export type CreateRoutineTemplateInput = z.infer<typeof createRoutineTemplateSchema>;
export type UpdateRoutineTemplateInput = z.infer<typeof updateRoutineTemplateSchema>;
export type RoutineTemplateQueryParams = z.infer<typeof routineTemplateQuerySchema>;
export type LogRoutineBlockInput = z.infer<typeof logRoutineBlockSchema>;