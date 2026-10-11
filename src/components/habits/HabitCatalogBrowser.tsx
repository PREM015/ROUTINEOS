'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Check, Loader2, AlertCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui';
import { fetchWithAuth } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { getFrequencyLabel } from '@/lib/habits/frequency';
import type { HabitDefinitionCard } from '@/types/habit';
import type {
  HabitDirection,
  HabitTrackingType,
  TimeOfDay,
} from '@/constants/prisma-enums';

/**
 * Browse the shared habit catalogue.
 *
 * ## What this screen deliberately does not show
 *
 * No target belonging to anyone else, no usage counts, no "people also have".
 * The API returns only suggestions plus an `alreadyAdded` flag computed from
 * the caller's *own* habits, so there is nothing here to leak even by accident.
 *
 * The consequence is also the feature: the value in the "Suggested" line is a
 * starting point, and the confirm dialog lets the user change every part of it
 * before it becomes their habit. Nothing shown here is locked.
 */

interface HabitCatalogBrowserProps {
  onAdd: (definition: HabitDefinitionCard) => void;
  /** Ids already added, so the button can reflect an add that happened elsewhere. */
  addedIds?: ReadonlySet<string>;
  className?: string;
}

const TRACKING_LABELS: Record<HabitTrackingType, string> = {
  BOOLEAN: 'Tick',
  COUNT: 'Count',
  DURATION: 'Duration',
};

const DIRECTION_LABELS: Record<HabitDirection, string> = {
  BUILD: 'Build up to',
  LIMIT: 'Stay under',
  AVOID: 'Avoid',
};

const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
  NIGHT: 'Night',
  ANYTIME: 'Anytime',
};

/** How many characters of a description to show before truncating. */
const DESCRIPTION_LIMIT = 140;

export function HabitCatalogBrowser({
  onAdd,
  addedIds,
  className,
}: HabitCatalogBrowserProps) {
  const [definitions, setDefinitions] = useState<HabitDefinitionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (category) params.set('category', category);

      const response = await fetchWithAuth(`/api/habit-catalog?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Could not load the catalogue (status ${response.status})`);
      }

      const json = (await response.json()) as {
        data?: { definitions?: HabitDefinitionCard[] };
      };
      setDefinitions(json.data?.definitions ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load the catalogue'
      );
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Search is client-side over the already-fetched page.
   *
   * The catalogue is one small bounded list, so a round trip per keystroke
   * would be slower and would make the input feel laggy for no benefit.
   */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return definitions;

    return definitions.filter(
      (d) =>
        d.name.toLowerCase().includes(term) ||
        (d.description ?? '').toLowerCase().includes(term) ||
        (d.category ?? '').toLowerCase().includes(term)
    );
  }, [definitions, search]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of definitions) {
      if (d.category) set.add(d.category);
    }
    return [...set].sort();
  }, [definitions]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search habits"
          icon={<Search className="h-4 w-4" />}
          aria-label="Search the habit catalogue"
          className="flex-1"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading catalogue…
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title="Nothing matches"
          description={
            search
              ? `No habit matches "${search}". Try a different word, or create it as a custom habit.`
              : 'The catalogue is empty.'
          }
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} habit{filtered.length === 1 ? '' : 's'}. Everything
            here is a suggestion — you can change the target, unit, frequency and
            tier before saving.
          </p>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((definition) => (
              <CatalogCard
                key={definition.id}
                definition={definition}
                alreadyAdded={
                  definition.alreadyAdded === true ||
                  addedIds?.has(definition.id) === true
                }
                onAdd={() => onAdd(definition)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CatalogCard({
  definition,
  alreadyAdded,
  onAdd,
}: {
  definition: HabitDefinitionCard;
  alreadyAdded: boolean;
  onAdd: () => void;
}) {
  const description =
    definition.description && definition.description.length > DESCRIPTION_LIMIT
      ? `${definition.description.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`
      : definition.description;

  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {definition.icon && (
          <span aria-hidden className="text-2xl leading-none">
            {definition.icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-foreground">
            {definition.name}
          </h3>
          {description && (
            <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {definition.category && (
          <Badge variant="default">{definition.category}</Badge>
        )}
        <Badge variant="primary">{definition.tier.replace(/_/g, ' ')}</Badge>
        <Badge variant="default">
          {getFrequencyLabel(definition.frequencyType, definition.frequencyValue)}
        </Badge>
        {definition.timeOfDay && (
          <Badge variant="default">{TIME_OF_DAY_LABELS[definition.timeOfDay]}</Badge>
        )}
      </div>

      {definition.trackingType !== 'BOOLEAN' && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {DIRECTION_LABELS[definition.direction]}
          </span>
          {definition.targetValue !== null && (
            <>
              {' '}
              {definition.targetValue.toLocaleString()}
              {definition.unit ? ` ${definition.unit}` : ''}
            </>
          )}
          {' · '}
          {TRACKING_LABELS[definition.trackingType]}
        </p>
      )}

      <Button
        onClick={onAdd}
        variant={alreadyAdded ? 'outline' : 'default'}
        className="mt-auto w-full"
        aria-label={
          alreadyAdded
            ? `Add another copy of ${definition.name}`
            : `Add ${definition.name} to my habits`
        }
      >
        {alreadyAdded ? (
          <>
            <Check className="mr-1.5 h-4 w-4" />
            Already added — add again
          </>
        ) : (
          'Add to my habits'
        )}
      </Button>
    </Card>
  );
}