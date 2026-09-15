import { z } from 'zod';
export const CreateTemplateSchema = z.object({ name: z.string().min(1), description: z.string().optional(), isDefault: z.boolean().optional() });
export const UpdateTemplateSchema = CreateTemplateSchema.partial().extend({ id: z.string() });
export const CreateBlockSchema = z.object({
  templateId: z.string(),
  title: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  type: z.enum(['FOCUS', 'ROUTINE', 'FLEX', 'BREAK']),
  color: z.string().optional(),
  habitIds: z.array(z.string()).optional(),
});
export const UpdateBlockSchema = CreateBlockSchema.partial().extend({ id: z.string() });
export const CreateExceptionSchema = z.object({ date: z.string(), type: z.enum(['HOLIDAY', 'SICK_DAY', 'VACATION', 'CUSTOM']), overrideTemplateId: z.string().optional() });
export const LogBlockSchema = z.object({ date: z.string(), status: z.enum(['COMPLETED', 'PARTIAL', 'SKIPPED', 'FAILED']), actualDuration: z.number().optional(), notes: z.string().optional() });
