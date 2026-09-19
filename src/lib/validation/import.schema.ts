import { z } from 'zod';
import { createHabitSchema } from '@/schemas/habit.schema';
import { createGoalSchema } from '@/schemas/goal.schema';
import { createProjectSchema } from '@/schemas/project.schema';
import { createTaskSchema } from '@/schemas/task.schema';

export const importHabitSchema = z.object({
  name: createHabitSchema.shape.name,
  description: createHabitSchema.shape.description,
  tier: createHabitSchema.shape.tier,
  category: z.string().max(100).optional(),
  color: createHabitSchema.shape.color,
  icon: createHabitSchema.shape.icon,
  frequencyType: createHabitSchema.shape.frequencyType,
  frequencyValue: createHabitSchema.shape.frequencyValue,
  targetCount: createHabitSchema.shape.targetCount,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reminderTime: createHabitSchema.shape.reminderTime,
  reminderEnabled: createHabitSchema.shape.reminderEnabled,
  points: createHabitSchema.shape.points,
  estimatedDuration: createHabitSchema.shape.estimatedDuration,
  difficulty: createHabitSchema.shape.difficulty,
  tags: z.array(z.string().max(100)).optional(),
});

export const importGoalSchema = z.object({
  title: createGoalSchema.shape.title,
  description: createGoalSchema.shape.description,
  type: createGoalSchema.shape.type,
  priority: createGoalSchema.shape.priority,
  targetValue: createGoalSchema.shape.targetValue,
  currentValue: createGoalSchema.shape.currentValue,
  unit: createGoalSchema.shape.unit,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['ACTIVE', 'COMPLETED', 'MISSED', 'CARRIED_OVER', 'ON_HOLD', 'CANCELLED']).optional(),
  tags: z.array(z.string().max(100)).optional(),
});

export const importProjectSchema = z.object({
  name: createProjectSchema.shape.name,
  description: createProjectSchema.shape.description,
  status: createProjectSchema.shape.status,
  priority: createProjectSchema.shape.priority,
  color: createProjectSchema.shape.color,
  icon: createProjectSchema.shape.icon,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tags: z.array(z.string().max(100)).optional(),
});

export const importTaskSchema = z.object({
  title: createTaskSchema.shape.title,
  description: createTaskSchema.shape.description,
  status: createTaskSchema.shape.status,
  priority: createTaskSchema.shape.priority,
  project: z.string().max(100).optional(),
  goal: z.string().max(100).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimatedMinutes: createTaskSchema.shape.estimatedMinutes,
  tags: z.array(z.string().max(100)).optional(),
});

export const importJournalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(200).optional(),
  content: z.string().min(1),
  mood: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  isFavorite: z.boolean().optional(),
  tags: z.array(z.string().max(100)).optional(),
});

export const importSleepSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetBedtime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  targetWakeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  actualBedtime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  actualWakeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quality: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
});

const importedRecord = z.union([
  importHabitSchema,
  importGoalSchema,
  importProjectSchema,
  importTaskSchema,
  importJournalSchema,
  importSleepSchema,
]);

export const importPayloadSchema = z.object({
  source: z
    .enum(['ROUTINEOS', 'NOTION', 'TODOIST', 'TRELLO', 'GOOGLE_CALENDAR', 'APPLE_HEALTH', 'GOOGLE_FIT', 'CUSTOM'])
    .optional(),
  version: z.number().int().min(1).optional().default(1),
  habits: z.array(importHabitSchema).optional(),
  goals: z.array(importGoalSchema).optional(),
  projects: z.array(importProjectSchema).optional(),
  tasks: z.array(importTaskSchema).optional(),
  journalEntries: z.array(importJournalSchema).optional(),
  sleepLogs: z.array(importSleepSchema).optional(),
  records: z.array(importedRecord).optional(),
});

export const importQuerySchema = z.object({
  mode: z.enum(['preview', 'import']).optional().default('preview'),
  overwrite: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
});

export type ImportHabitInput = z.infer<typeof importHabitSchema>;
export type ImportGoalInput = z.infer<typeof importGoalSchema>;
export type ImportProjectInput = z.infer<typeof importProjectSchema>;
export type ImportTaskInput = z.infer<typeof importTaskSchema>;
export type ImportJournalInput = z.infer<typeof importJournalSchema>;
export type ImportSleepInput = z.infer<typeof importSleepSchema>;
export type ImportPayloadInput = z.infer<typeof importPayloadSchema>;
export type ImportQueryParams = z.infer<typeof importQuerySchema>;