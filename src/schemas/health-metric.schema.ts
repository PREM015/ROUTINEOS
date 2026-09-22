import { z } from 'zod';

export const healthMetricSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  metricType: z.enum(['WEIGHT', 'BODY_FAT', 'STEPS', 'HEART_RATE', 'BLOOD_PRESSURE']),
  value: z.number({ message: 'Value must be numeric' }),
  unit: z.string().min(1, 'Unit is required').max(50, 'Unit must be 50 characters or less'),
  timeOfDay: z.string().max(50, 'timeOfDay must be 50 characters or less').optional(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional(),
  source: z.string().max(50, 'Source must be 50 characters or less').optional(),
  sourceId: z.string().max(200, 'sourceId must be 200 characters or less').optional(),
});

export const updateHealthMetricSchema = healthMetricSchema.partial();

export const healthMetricQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  metricType: z.enum(['WEIGHT', 'BODY_FAT', 'STEPS', 'HEART_RATE', 'BLOOD_PRESSURE']).optional(),
  timeOfDay: z.string().optional(),
  source: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type HealthMetricInput = z.infer<typeof healthMetricSchema>;
export type UpdateHealthMetricInput = z.infer<typeof updateHealthMetricSchema>;
export type HealthMetricQueryParams = z.infer<typeof healthMetricQuerySchema>;