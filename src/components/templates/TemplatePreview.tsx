"use client";

/**
 * TemplatePreview — a dialog previewing the blocks of a template as a
 * time-ordered timeline, with an optional "Use template" action.
 *
 * Usage:
 *   <TemplatePreview open={open} onOpenChange={setOpen} template={card}
 *     onUse={applyTemplate} />
 */
import { Clock, LayoutTemplate, Zap } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import Dialog from '@/components/ui/Dialog';
import { TemplateCardData } from './TemplateCard';

export interface TemplatePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateCardData | null;
  onUse?: (template: TemplateCardData) => void;
}

const ENERGY_LABELS: Record<string, string> = {
  HIGH: 'High energy',
  MEDIUM: 'Medium energy',
  LOW: 'Low energy',
};

const ENERGY_COLORS: Record<string, string> = {
  HIGH: '#3b82f6',
  MEDIUM: '#f59e0b',
  LOW: '#6b7280',
};

export default function TemplatePreview({ open, onOpenChange, template, onUse }: TemplatePreviewProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={template?.name ?? 'Template preview'}
      description={template?.description ?? undefined}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {template && onUse && (
            <Button onClick={() => onUse(template)}>
              Use template
            </Button>
          )}
        </>
      }
    >
      {template && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {template.category && <Badge variant="primary">{template.category}</Badge>}
            {template.estimatedDurationMinutes && (
              <Badge variant="default" className="gap-1">
                <Clock className="h-3 w-3" />
                ~{template.estimatedDurationMinutes} min
              </Badge>
            )}
            {template.isFeatured && <Badge variant="warning">Featured</Badge>}
          </div>

          {template.blocks && template.blocks.length > 0 ? (
            <ol className="relative space-y-4 border-l-2 border-gray-200 pl-5" aria-label="Template schedule">
              {template.blocks.map((block, index) => {
                const energy = block.energyLevel
                  ? (ENERGY_LABELS[block.energyLevel] ?? block.energyLevel)
                  : null;
                const energyColor = block.energyLevel
                  ? (ENERGY_COLORS[block.energyLevel] ?? '#6b7280')
                  : null;
                return (
                  <li key={`${block.startTime}-${index}`} className="relative">
                    <span
                      className="absolute -left-[27px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white"
                      style={{ backgroundColor: template.color ?? '#3b82f6' }}
                      aria-hidden="true"
                    />
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {block.startTime} – {block.endTime}
                    </p>
                    <p className="mt-0.5 font-medium text-gray-900">
                      {block.icon && <span className="mr-1" aria-hidden="true">{block.icon}</span>}
                      {block.title}
                    </p>
                    {block.description && <p className="text-sm text-gray-500">{block.description}</p>}
                    {(energy || block.trackCompletion) && (
                      <div className="mt-1.5 flex gap-2">
                        {energy && (
                          <Badge variant="default" className="gap-1" style={{ color: energyColor ?? undefined }}>
                            <Zap className="h-3 w-3" />
                            {energy}
                          </Badge>
                        )}
                        {block.trackCompletion && <Badge variant="success">Tracks completion</Badge>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <LayoutTemplate className="h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-500">
                This template doesn't define a schedule — applying it creates a starter structure.
              </p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}