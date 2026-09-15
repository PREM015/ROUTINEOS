import { z } from 'zod';
export const ImportDataSchema = z.object({ exportedAt: z.string(), version: z.string(), user: z.any().optional(), habits: z.array(z.any()).optional(), goals: z.array(z.any()).optional(), sleepLogs: z.array(z.any()).optional(), scores: z.array(z.any()).optional(), reflections: z.array(z.any()).optional() });
export function validateImportData(data: unknown): { valid: boolean; errors: string[] } {
  const result = ImportDataSchema.safeParse(data);
  if (result.success) return { valid: true, errors: [] };
  return { valid: false, errors: result.error.errors.map(e => e.message) };
}
export function validateImportVersion(version: string): boolean { return version === '1.0'; }
