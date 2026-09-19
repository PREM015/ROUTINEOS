import type { TemplateType } from '@prisma/client';
import { TEMPLATE_CATEGORIES } from '@/lib/constants/templates';

/**
 * Template content validation.
 * Pure validation of the JSON payload stored in `Template.content`.
 */

export interface RoutineTemplateBlockContent {
  startTime: string;
  endTime: string;
  title: string;
  isOvernight?: boolean;
  description?: string | null;
  notes?: string | null;
  sortOrder?: number;
  color?: string | null;
  icon?: string | null;
  energyLevel?: string | null;
  trackCompletion?: boolean;
  isRecurring?: boolean;
  categoryId?: string | null;
}

export interface RoutineTemplateContent {
  name?: string;
  description?: string;
  dayType?: string;
  color?: string;
  icon?: string;
  estimatedDuration?: number;
  blocks?: RoutineTemplateBlockContent[];
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/**
 * Whether a string is a valid template type.
 */
export function isValidTemplateType(value: unknown): value is TemplateType {
  return typeof value === 'string' && value in TEMPLATE_CATEGORIES;
}

/**
 * Whether a value is a string in HH:mm (or 24:00) form.
 */
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  data?: RoutineTemplateContent;
}

/**
 * Validate and normalize a template content string. Returns the parsed
 * content when valid, and a list of human-readable error messages otherwise.
 * @example
 * validateTemplateContent('{"name":"Morning","blocks":[]}')
 * // => { valid: true, errors: [], data: { name: 'Morning', blocks: [] } }
 */
export function validateTemplateContent(content: string): TemplateValidationResult {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return { valid: false, errors: ['content must be valid JSON'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, errors: ['content must be a JSON object'] };
  }

  const record = parsed as Record<string, unknown>;

  if (record.name !== undefined && typeof record.name !== 'string') {
    errors.push('name must be a string');
  }
  if (
    record.dayType !== undefined &&
    !isValidTemplateType(record.dayType)
  ) {
    errors.push(`dayType must be one of: ${Object.keys(TEMPLATE_CATEGORIES).join(', ')}`);
  }
  if (
    record.estimatedDuration !== undefined &&
    (typeof record.estimatedDuration !== 'number' || record.estimatedDuration <= 0)
  ) {
    errors.push('estimatedDuration must be a positive number');
  }

  const blocks: RoutineTemplateBlockContent[] = [];
  if (record.blocks !== undefined) {
    if (!Array.isArray(record.blocks)) {
      errors.push('blocks must be an array');
    } else {
      for (const [index, block] of record.blocks.entries()) {
        validateBlock(block, index, blocks, errors);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors,
    data: {
      ...(record as Omit<RoutineTemplateContent, 'blocks'>),
      blocks: blocks.length > 0 ? blocks : undefined,
    },
  };
}

function validateBlock(
  block: unknown,
  index: number,
  blocks: RoutineTemplateBlockContent[],
  errors: string[]
): void {
  const prefix = `blocks[${index}]`;
  if (typeof block !== 'object' || block === null) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  const record = block as Record<string, unknown>;
  if (typeof record.title !== 'string' || record.title.trim().length === 0) {
    errors.push(`${prefix}.title is required`);
  }
  if (!isValidTime(record.startTime)) {
    errors.push(`${prefix}.startTime must be in HH:mm format`);
  }
  if (!isValidTime(record.endTime)) {
    errors.push(`${prefix}.endTime must be in HH:mm format`);
  }
  if (record.energyLevel !== undefined) {
    const level = String(record.energyLevel);
    if (level !== 'HIGH' && level !== 'MEDIUM' && level !== 'LOW') {
      errors.push(`${prefix}.energyLevel must be HIGH, MEDIUM, or LOW`);
    }
  }

  if (
    typeof record.startTime === 'string' &&
    typeof record.endTime === 'string' &&
    isValidTime(record.startTime) &&
    isValidTime(record.endTime)
  ) {
    const isOvernight =
      record.isOvernight === true ||
      (record.endTime <= record.startTime && record.endTime !== '24:00');
    if (record.endTime === record.startTime) {
      errors.push(`${prefix} must span at least one minute`);
    }
    blocks.push({
      startTime: record.startTime,
      endTime: record.endTime,
      title: typeof record.title === 'string' ? record.title : '',
      isOvernight,
      description: optionalString(record.description),
      notes: optionalString(record.notes),
      sortOrder: optionalNumber(record.sortOrder),
      color: optionalString(record.color),
      icon: optionalString(record.icon),
      energyLevel: optionalString(record.energyLevel),
      trackCompletion: Boolean(record.trackCompletion),
      isRecurring: Boolean(record.isRecurring),
      categoryId: optionalString(record.categoryId),
    });
  }
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}