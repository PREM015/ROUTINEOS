'use client';

/**
 * JournalFilters — search plus the advanced filters, over one compact row.
 *
 * Search is the only control on the row; everything else is behind a disclosure.
 * The previous layout put a tag `<Select>`, a date `<Input>` and a reset button
 * in a permanent sidebar card, so the journal opened on four controls competing
 * with the writing action for attention, three of which most days are unused.
 *
 * Every control reports a change to the parent, which owns the state in the URL.
 * That makes the view survive a reload and be shareable. Filter changes are
 * written with `router.replace`, deliberately: pushing one history entry per
 * keystroke of a search box would make the back button useless, and the browser
 * back still leaves the journal for wherever the user came from.
 */
import * as React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { Tag } from '@/generated/prisma';
import { Button, Input, Select } from '@/components/ui';
import {
  JOURNAL_SORT_OPTIONS,
  JOURNAL_VIEW_OPTIONS,
  hasJournalFilters,
  type JournalBrowseState,
  type JournalSortField,
  type JournalSortOrder,
  type JournalView,
} from '@/lib/journal/query';
import { cn } from '@/lib/utils';

export interface JournalFiltersProps {
  state: JournalBrowseState;
  tags: Tag[];
  onChange: (change: Partial<JournalBrowseState>) => void;
  /** Resets every filter and the sort, keeping the page size. */
  onClear: () => void;
  className?: string;
}

/** "date:desc" ⇄ the flat sort pair the parent stores. */
function sortValue(state: JournalBrowseState): string {
  return `${state.sortBy}:${state.sortOrder}`;
}

export default function JournalFilters({
  state,
  tags,
  onChange,
  onClear,
  className,
}: JournalFiltersProps) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  // Local echo so typing is responsive while the parent debounces into the URL.
  // Committing on every keystroke would push a history entry per character.
  const [searchText, setSearchText] = React.useState(state.search);
  const lastCommitted = React.useRef(state.search);

  // Adopt an external change (clear, back button) but not while typing.
  React.useEffect(() => {
    if (state.search !== lastCommitted.current) {
      lastCommitted.current = state.search;
      setSearchText(state.search);
    }
  }, [state.search]);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchText === lastCommitted.current) return;
      lastCommitted.current = searchText;
      onChange({ search: searchText });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchText, onChange]);

  const filtersActive = hasJournalFilters(state);
  const advancedCount = [
    state.tagId,
    state.mood,
    state.view !== 'active' ? state.view : '',
  ].filter(Boolean).length;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search entries…"
            aria-label="Search journal entries"
            className="pl-9"
          />
        </div>

        <Button
          variant={advancedOpen ? 'default' : 'outline'}
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          aria-controls="journal-advanced-filters"
        >
          <SlidersHorizontal className="mr-1.5 h-4 w-4" />
          Filters
          {advancedCount > 0 && (
            <span className="ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
              {advancedCount}
            </span>
          )}
        </Button>

        {(filtersActive || advancedOpen) && (
          // The width lives on this wrapper, not on the `Select`: `Select` puts
          // `className` on the `<select>` and wraps it in a `w-full` div, so a
          // class on the control cannot stop the wrapper filling the flex row.
          <div className="w-48">
            <Select
              label="Sort"
              value={sortValue(state)}
              onChange={(event) => {
                const [field, order] = event.target.value.split(':');
                onChange({
                  sortBy: field as JournalSortField,
                  sortOrder: order as JournalSortOrder,
                });
              }}
              options={JOURNAL_SORT_OPTIONS.map((option) => ({
                value: `${option.value}:${option.order}`,
                label: option.label,
              }))}
            />
          </div>
        )}

        {filtersActive && (
          <Button variant="ghost" onClick={onClear}>
            <X className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {advancedOpen && (
        <div
          id="journal-advanced-filters"
          className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3"
        >
          <Select
            label="Show"
            value={state.view}
            onChange={(event) => onChange({ view: event.target.value as JournalView })}
            options={JOURNAL_VIEW_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />

          <Select
            label="Tag"
            value={state.tagId}
            onChange={(event) => onChange({ tagId: event.target.value })}
            options={[
              { value: '', label: 'All tags' },
              ...tags.map((tag) => ({ value: tag.id, label: tag.name })),
            ]}
          />

          <Select
            label="Mood"
            value={state.mood === null ? '' : String(state.mood)}
            onChange={(event) =>
              onChange({ mood: event.target.value === '' ? null : Number(event.target.value) })
            }
            options={[
              { value: '', label: 'Any mood' },
              ...[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} of 5` })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
