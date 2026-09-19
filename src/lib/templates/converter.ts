import type { DayType } from '@prisma/client';
import type { DefaultTemplate } from '@/lib/constants/templates';
import type { RoutineTemplateWithBlocks } from '@/types/routine';
import {
  validateTemplateContent,
  type RoutineTemplateBlockContent,
  type RoutineTemplateContent,
} from './validator';

/**
 * Template converter.
 * Serialization between `Template.content` strings, default templates, and
 * routine templates.
 */

/**
 * Build the `Template.content` JSON string from a default template definition.
 */
export function defaultTemplateToContent(
  template: DefaultTemplate,
  dayType: DayType = 'CUSTOM'
): string {
  const blocks: RoutineTemplateBlockContent[] = (template.blocks ?? []).map(
    block => ({
      startTime: block.startTime,
      endTime: block.endTime,
      title: block.title,
      description: block.description,
      energyLevel: block.energyLevel ?? null,
      trackCompletion: block.trackCompletion ?? false,
      color: block.color ?? null,
      icon: block.icon ?? null,
    })
  );

  const content: RoutineTemplateContent = {
    name: template.name,
    description: template.description,
    dayType,
    color: template.color,
    icon: template.icon,
    estimatedDuration: template.estimatedDurationMinutes,
    blocks: blocks.length > 0 ? blocks : undefined,
  };

  return JSON.stringify(content);
}

/**
 * Parse a `Template.content` string, returning `null` when invalid.
 */
export function parseTemplateContent(content: string): RoutineTemplateContent | null {
  const result = validateTemplateContent(content);
  return result.valid ? (result.data ?? null) : null;
}

/**
 * Validate a content string. Convenience wrapper for callers that only need a
 * boolean.
 */
export function isValidTemplateContent(content: string): boolean {
  return validateTemplateContent(content).valid;
}

/**
 * Serialize a routine template (with its blocks) into a `Template.content`
 * string so it can be shared or stored as a reusable template.
 */
export function routineTemplateToContent(
  routine: RoutineTemplateWithBlocks
): string {
  const blocks: RoutineTemplateBlockContent[] = routine.blocks.map(block => ({
    startTime: block.startTime,
    endTime: block.endTime,
    title: block.title,
    isOvernight: block.isOvernight,
    description: block.description ?? null,
    notes: block.notes ?? null,
    sortOrder: block.sortOrder,
    color: block.color ?? null,
    icon: block.icon ?? null,
    energyLevel: block.energyLevel ?? null,
    trackCompletion: block.trackCompletion ?? false,
    isRecurring: block.isRecurring ?? false,
    categoryId: block.categoryId ?? null,
  }));

  const content: RoutineTemplateContent = {
    name: routine.name,
    description: routine.description ?? undefined,
    dayType: routine.dayType,
    color: routine.color ?? undefined,
    icon: routine.icon ?? undefined,
    estimatedDuration: routine.estimatedDuration ?? undefined,
    blocks: blocks.length > 0 ? blocks : undefined,
  };

  return JSON.stringify(content);
}

export interface RoutineDraft {
  name: string;
  description?: string;
  dayType: DayType;
  blocks: RoutineTemplateBlockContent[];
}

/**
 * Convert a content string into a routine creation draft (blocks already
 * validated), or `null` when the content is invalid.
 */
export function contentToRoutineDraft(content: string): RoutineDraft | null {
  const parsed = parseTemplateContent(content);
  if (!parsed) return null;

  return {
    name: parsed.name ?? 'Untitled Routine',
    description: parsed.description,
    dayType: isDayType(parsed.dayType) ? parsed.dayType : 'CUSTOM',
    blocks: parsed.blocks ?? [],
  };
}

function isDayType(value: unknown): value is DayType {
  return (
    typeof value === 'string' &&
    ['WORKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM'].includes(value)
  );
}