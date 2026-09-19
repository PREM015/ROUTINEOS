"use client";

/**
 * TemplateBrowser — a browsable, filterable gallery of templates. Loads the
 * user's templates plus public templates from GET /api/templates, falls back
 * to the library's DEFAULT_TEMPLATES when none exist, and applies a template
 * via POST /api/templates/use.
 *
 * Usage:
 *   <TemplateBrowser onApplied={refreshRoutines} />
 */
import * as React from 'react';
import { Search, Sparkles } from 'lucide-react';
import type { Template, TemplateType } from '@prisma/client';
import { DEFAULT_TEMPLATES } from '@/lib/constants/templates';
import { apiRequest } from '@/lib/api-client';
import { EmptyState, Input, Spinner } from '@/components/ui';
import TemplateCard, { toTemplateCardData, type TemplateCardData } from './TemplateCard';
import TemplatePreview from './TemplatePreview';
import { cn } from '@/lib/utils';

export interface TemplateBrowserProps {
  /** Called when a template has been applied successfully. */
  onApplied?: () => void;
  className?: string;
}

export const ALL_CATEGORIES = 'ALL' as const;

export default function TemplateBrowser({ onApplied, className }: TemplateBrowserProps) {
  const [templates, setTemplates] = React.useState<TemplateCardData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<string>(ALL_CATEGORIES);
  const [search, setSearch] = React.useState('');
  const [applyingId, setApplyingId] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<TemplateCardData | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiRequest<Template[]>('/api/templates');
        if (cancelled) return;
        setTemplates(data.length > 0 ? data.map(toTemplateCardData) : DEFAULT_TEMPLATES.map(toTemplateCardData));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load templates');
        setTemplates(DEFAULT_TEMPLATES.map(toTemplateCardData));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = React.useMemo(() => {
    const c = new Set(templates.map((template) => template.type));
    return [ALL_CATEGORIES, ...c];
  }, [templates]);

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (category !== ALL_CATEGORIES && template.type !== category) return false;
      if (query.length === 0) return true;
      const haystack = [template.name, template.description ?? '', template.category ?? '', ...template.tags]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [templates, category, search]);

  const useTemplate = async (template: TemplateCardData) => {
    if (applyingId) return;
    setApplyingId(template.id);
    setApplied(null);
    setError(null);
    try {
      await apiRequest<{ templateId: string; type: TemplateType }>('/api/templates/use', {
        method: 'POST',
        body: { templateId: template.id },
      });
      setPreview(null);
      setApplied(template.name);
      onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template');
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:max-w-xs md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={cn(
                'rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                category === cat
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {cat === ALL_CATEGORIES ? 'All' : cat.replaceAll('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {applied && (
        <p aria-live="polite" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          “{applied}” was applied successfully.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-10 w-10 text-gray-300" />}
          title="No templates found"
          description="Try a different category or search term."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={(t) => void useTemplate(t)}
              onPreview={setPreview}
            />
          ))}
        </div>
      )}

      <TemplatePreview
        open={preview !== null}
        onOpenChange={(next) => {
          if (!next) setPreview(null);
        }}
        template={preview}
        onUse={(template) => void useTemplate(template)}
      />
    </div>
  );
}