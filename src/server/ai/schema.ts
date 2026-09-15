import { z } from 'zod';

export const AIInsightSchema = z.object({
  insights: z.array(z.object({
    type: z.enum(['pattern', 'recommendation', 'warning', 'achievement']),
    title: z.string(),
    summary: z.string(),
    actionable: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low'])
  })),
  weeklyFocus: z.string().optional()
});

export type AIInsightResponse = z.infer<typeof AIInsightSchema>;
