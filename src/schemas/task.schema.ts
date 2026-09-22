import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(300, 'Task title must be 300 characters or less'),
  description: z.string().max(5000, 'Description must be 5000 characters or less').optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL', 'PERSONAL', 'ACADEMIC', 'NON_PROFIT', 'PROFESSIONAL']).optional(),
  projectId: z.string().cuid().optional(),
  goalId: z.string().cuid().optional(),
  parentTaskId: z.string().cuid().optional(),
  dueDate: z.coerce.date().optional(),
  scheduledFor: z.coerce.date().optional(),
  estimatedMinutes: z.number().int().min(1, 'Estimated time must be at least 1 minute').max(1440, 'Estimated time must be at most 1440 minutes').optional(),
  actualMinutes: z.number().int().min(0, 'Actual time must be 0 or greater').optional(),
  isUrgent: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  dependsOnIds: z.array(z.string().cuid()).optional(),
  tagIds: z.array(z.string().cuid()).optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskQuerySchema = z.object({
  status: z.array(z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'])).optional(),
  priority: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL', 'PERSONAL', 'ACADEMIC', 'NON_PROFIT', 'PROFESSIONAL'])).optional(),
  projectId: z.string().cuid().optional(),
  goalId: z.string().cuid().optional(),
  parentTaskId: z.string().cuid().optional(),
  search: z.string().optional(),
  dueBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  overdue: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  sortBy: z.enum(['title', 'createdAt', 'dueDate', 'priority', 'status', 'scheduledFor']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  includeCompleted: z.boolean().optional(),
});

export const taskDependencySchema = z.object({
  taskId: z.string().cuid(),
  dependsOnId: z.string().cuid(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQueryParams = z.infer<typeof taskQuerySchema>;
export type TaskDependencyInput = z.infer<typeof taskDependencySchema>;