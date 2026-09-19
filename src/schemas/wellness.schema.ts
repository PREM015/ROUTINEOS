import { z } from 'zod';

export const energyLogSchema = z.object({
  energyLevel: z
    .number()
    .int('Energy must be a whole number')
    .min(1, 'Energy must be between 1 and 5')
    .max(5, 'Energy must be between 1 and 5'),
  activity: z.string().max(200, 'Activity must be 200 characters or less').optional(),
  location: z.string().max(200, 'Location must be 200 characters or less').optional(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional(),
  timestamp: z.coerce.date().optional(),
});

export const energyQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
  analyze: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const weatherLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  condition: z.enum(['SUNNY', 'PARTLY_CLOUDY', 'CLOUDY', 'RAINY', 'STORMY', 'SNOWY', 'FOGGY', 'WINDY']),
  temperature: z.number().min(-100, 'Temperature is out of range').max(100, 'Temperature is out of range').optional(),
  humidity: z.number().int().min(0, 'Humidity must be between 0 and 100').max(100, 'Humidity must be between 0 and 100').optional(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional(),
});

export const weatherQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const wellnessQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type EnergyLogInput = z.infer<typeof energyLogSchema>;
export type EnergyQueryParams = z.infer<typeof energyQuerySchema>;
export type WeatherLogInput = z.infer<typeof weatherLogSchema>;
export type WeatherQueryParams = z.infer<typeof weatherQuerySchema>;
export type WellnessQueryParams = z.infer<typeof wellnessQuerySchema>;