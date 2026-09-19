"use client";

/**
 * TemplateCard — a card for a routine/template: icon, name, description,
 * category, estimated duration, tags and a "Use template" action. Normalizes
 * both the Prisma `Template` and library `DefaultTemplate` shapes into a shared
 * `TemplateCardData` via `toTemplateCardData`.
 *
 * Usage:
 *   <TemplateCard template={card} onUse={(t) => useTemplate(t)} onPreview={openPreview} />
 */
import * as React from 'react';
import type { Template, TemplateType } from '@prisma/client';
import { Clock, Eye, LayoutTemplate, Star } from 'lucide-react';
import type { DefaultTemplate } from '@/lib/constants/templates';
import { parseTemplateContent } from '@/lib/templates/converter';
import type { RoutineTemplateBlockContent } from '@/lib/templates/validator';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface TemplateCardData {
  id: string;
  type: TemplateType;
  name: string;
  description?: string | null;
  category?: string | null;
  color?: string | null;
  icon?: string | null;
  tags: string[];
  isFeatured: boolean;
  estimatedDurationMinutes?: number | null;
  blocks?: RoutineTemplateBlockContent[];
}

function parseTags(source: string | null): string[] {
  if (!source) return [];
  try {
    const parsed: unknown = JSON.parse(source);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function minutesFromContent(content: string): number | null {
  const parsed = parseTemplateContent(content);
  return parsed?.estimatedDuration ?? null;
}

/**
 * Normalize either a database Template or a DefaultTemplate into the shared
 * card shape UI components can consume.
 */
export function toTemplateCardData(source: Template | DefaultTemplate): TemplateCardData {
  if ('content' in source) {
    const parsed = parseTemplateContent(source.content);
    const duration = parsed?.estimatedDuration ?? null;
    return {
      id: source.id,
      type: source.type,
      name: source.name,
      description: source.description,
      category: source.category,
      color: source.color,
      icon: source.icon,
      tags: parseTags(source.tags),
      isFeatured: source.isFeatured,
      estimatedDurationMinutes: duration,
      blocks: parsed?.blocks ?? [],
    };
  }

  const blocks: RoutineTemplateBlockContent[] = (source.blocks ?? []).map((block) => ({
    startTime: block.startTime,
    endTime: block.endTime,
    title: block.title,
    description: block.description,
    energyLevel: block.energyLevel ?? null,
    trackCompletion: block.trackCompletion ?? false,
    color: block.color ?? null,
    icon: block.icon ?? null,
  }));

  return {
    id: source.id,
    type: source.type,
    name: source.name,
    description: source.description,
    category: source.category,
    color: source.color,
    icon: source.icon,
    tags: [...source.tags],
    isFeatured: source.isFeatured,
    estimatedDurationMinutes: source.estimatedDurationMinutes ?? null,
    blocks,
  };
}

export interface TemplateCardProps {
  template: TemplateCardData;
  onUse?: (template: TemplateCardData) => void;
  onPreview?: (template: TemplateCardData) => void;
  className?: string;
}

export default function TemplateCard({ template, onUse, onPreview, className }: TemplateCardProps) {
  const useLabel = template.estimatedDurationMinutes
    ? `Use template · ${template.estimatedDurationMinutes} min`
    : 'Use template';

  return (
    <Card className={cn('flex h-full flex-col p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-lg text-xl"
            style={{ backgroundColor: template.color ? `${template.color}1f` : '#f3f4f6' }}
            aria-hidden="true"
          >
            {template.icon ?? <LayoutTemplate className="h-5 w-5 text-gray-400" />}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">{template.name}</h3>
            <p className="text-xs text-gray-500">{template.category ?? template.type}</p>
          </div>
        </div>
        {template.isFeatured && (
          <Badge variant="warning" className="gap-1">
            <Star className="h-3 w-3" />
            Featured
          </Badge>
        )}
      </div>

      <p className="mt-3 line-clamp-3 flex-1 text-sm text-gray-500">{template.description}</p>

      {template.estimatedDurationMinutes && (
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500">
          <Clock className="h-3.5 w-3.5" />
          ~{template.estimatedDurationMinutes} minutes
        </p>
      )}

      {template.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {template.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="default">
              {tag}
            </Badge>
          ))}
          {template.tags.length > 4 && <span className="text-xs text-gray-400">+{template.tags.length - 4}</span>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {onPreview && (
          <Button variant="outline" size="sm" onClick={() => onPreview(template)}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Preview
          </Button>
        )}
        {onUse && (
          <Button size="sm" onClick={() => onUse(template)}>
            {useLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}