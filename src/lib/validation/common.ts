import { z } from 'zod';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const TIME_REGEX = /^\d{2}:\d{2}$/;

export const idSchema = z.string().uuid('A valid UUID is required');

export const dateSchema = z
  .string()
  .regex(DATE_REGEX, 'Date must be in YYYY-MM-DD format');

export const timeSchema = z
  .string()
  .regex(TIME_REGEX, 'Time must be in HH:mm format');

export const optionalString = z
  .string()
  .min(1, 'Value must not be empty')
  .optional();

export const paginationSchema = z.object({
  limit: z
    .number({ invalid_type_error: 'Limit must be a number' })
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be at most 100')
    .optional(),
  offset: z
    .number({ invalid_type_error: 'Offset must be a number' })
    .int()
    .min(0, 'Offset must be 0 or greater')
    .optional(),
});

export const sortOrderSchema = z.enum(['asc', 'desc']);

export type IdInput = z.infer<typeof idSchema>;
export type DateInput = z.infer<typeof dateSchema>;
export type TimeInput = z.infer<typeof timeSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type SortOrder = z.infer<typeof sortOrderSchema>;
