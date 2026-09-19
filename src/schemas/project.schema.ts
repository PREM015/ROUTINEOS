import { z } from 'zod';

export const milestoneSchema = z.object({
  title: z.string().min(1, 'Milestone title is required').max(200, 'Milestone title must be 200 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional(),
  targetValue: z.number().positive('Target value must be positive').optional(),
  dueDate: z.coerce.date().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Project name must be 200 characters or less'),
  description: z.string().max(5000, 'Description must be 5000 characters or less').optional(),
  status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'PERSONAL', 'ACADEMIC', 'NON_PROFIT', 'PROFESSIONAL']).optional(),
  categoryId: z.string().uuid().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Color must be a hex value like #FF00AA').optional(),
  icon: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  progress: z.number().min(0, 'Progress must be between 0 and 100').max(100, 'Progress must be between 0 and 100').optional(),
  milestones: z.array(milestoneSchema).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export const projectQuerySchema = z.object({
  search: z.string().optional(),
  status: z.array(z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'CANCELLED'])).optional(),
  categoryId: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'createdAt', 'progress', 'priority', 'endDate']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type MilestoneInput = z.infer<typeof milestoneSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectQueryParams = z.infer<typeof projectQuerySchema>;