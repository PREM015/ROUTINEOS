/**
 * Template loader.
 * Loads built-in starter templates, prepares `Template` create inputs, and
 * validates serialized content. No DB access.
 */

import type { TemplateType } from '@prisma/client';
import type { DefaultTemplate } from '@/lib/constants/templates';
import { DEFAULT_TEMPLATES, getTemplatesByType } from '@/lib/constants/templates';
import {
  defaultTemplateToContent,
  isValidTemplateContent,
  parseTemplateContent,
} from './converter';

export interface TemplateCreateInputLike {
  type: TemplateType;
  name: string;
  description: string | null;
  category: string;
  color?: string;
  icon?: string;
  tags: string[];
  content: string;
  isPublic: boolean;
  isOfficial: boolean;
  isFeatured: boolean;
}

/**
 * All built-in starter templates.
 * @example
 * loadDefaultTemplates() // => DefaultTemplate[] (8 built-ins)
 */
export function loadDefaultTemplates(): readonly DefaultTemplate[] {
  return DEFAULT_TEMPLATES;
}

/**
 * Built-in templates filtered by type. Returns `[]` when none match.
 */
export function loadDefaultTemplatesByType(
  type: TemplateType
): readonly DefaultTemplate[] {
  return getTemplatesByType(type);
}

/**
 * A single default template by id, or `undefined` when unknown.
 */
export function loadDefaultTemplateById(
  id: string
): DefaultTemplate | undefined {
  return DEFAULT_TEMPLATES.find(template => template.id === id);
}

/**
 * Count of built-in starter templates (optionally for one type).
 */
export function countLoadedTemplates(type?: TemplateType): number {
  if (type) return getTemplatesByType(type).length;
  return DEFAULT_TEMPLATES.length;
}

/**
 * Assert that a default template's serialized content passes validation.
 * Returns `true` when it parses cleanly.
 * @example
 * validateLoadedTemplate(DEFAULT_TEMPLATES[0]) // => boolean
 */
export function validateLoadedTemplate(template: DefaultTemplate): boolean {
  try {
    return isValidTemplateContent(defaultTemplateToContent(template));
  } catch {
    return false;
  }
}

/**
 * Parse the serialized content of a default template. Returns `null` when
 * the content fails validation.
 */
export function parseLoadedTemplateContent(
  template: DefaultTemplate
): ReturnType<typeof parseTemplateContent> {
  try {
    return parseTemplateContent(defaultTemplateToContent(template));
  } catch {
    return null;
  }
}

/**
 * Build a `Template` create input (minus `userId`) from a default template.
 * Content is serialized to JSON and validated first; throws on invalid
 * content rather than persisting garbage.
 * @example
 * toTemplateCreateInput(loadDefaultTemplateById('morning-routine'))
 * // => { type: 'MORNING_ROUTINE', name: 'Morning Routine', content: '{...}', ... }
 */
export function toTemplateCreateInput(
  template: DefaultTemplate
): TemplateCreateInputLike {
  const content = defaultTemplateToContent(template);
  if (!isValidTemplateContent(content)) {
    throw new Error(`Invalid template content for "${template.id}"`);
  }

  return {
    type: template.type,
    name: template.name,
    description: template.description,
    category: template.category,
    color: template.color,
    icon: template.icon,
    tags: [...template.tags],
    content,
    isPublic: false,
    isOfficial: true,
    isFeatured: template.isFeatured,
  };
}

/**
 * Prepare all built-in templates as create inputs. Useful for seeding.
 */
export function toAllTemplateCreateInputs(): TemplateCreateInputLike[] {
  return DEFAULT_TEMPLATES.map(template => toTemplateCreateInput(template));
}