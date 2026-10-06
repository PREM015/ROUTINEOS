'use client';

/**
 * AchievementControlBar — search, layout and filtering in one row.
 *
 * ## Where each control's state lives
 *
 * Search, status, tier, category, sort and **view** are held in the URL. Density is
 * held on the device.
 *
 * The spec says both "everything except density and view is held in the URL" (§4.4)
 * and "filters, sort, view, category, search and the open badge are in the URL"
 * (acceptance criterion 6). Where they disagree the acceptance criterion wins:
 * a shared link that silently reverts to a different layout is a broken link, and
 * there is no reading under which a view mode is more private than a filter.
 * Density stays on the device because it is a property of the screen in front of
 * you, not of the thing being linked to.
 *
 * ## The light-grey bar this replaced
 *
 * The previous filter bar hardcoded `bg-gray-100`, `bg-white`, `text-gray-900`,
 * `text-gray-500`, `border-gray-300` and `focus:ring-blue-600`. Those are light
 * values: on the dark theme the bar's own background was lighter than the page
 * behind it. Every one is a token here.
 *
 * ## Keyboard
 *
 * `/` focuses search, `1`-`5` toggle the rarity tiers, and the result count is
 * announced through a polite live region. The number keys are ignored while a text
 * field has focus, so typing "3" into the search box searches rather than filtering.
 */

import { useEffect, useRef } from 'react';
import { FilterX, LayoutGrid, List, Rows3, Search, X } from 'lucide-react';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  type AchievementCategory,
  type AchievementRarity,
} from '@/lib/constants/achievements';
import {
  RARITY_ORDER,
  isDefaultFilters,
  type AchievementDensity,
  type AchievementFilters,
  type AchievementSort,
  type AchievementTile,
  type AchievementView,
} from '@/lib/achievements/view-model';
import { cn } from '@/lib/utils';

export interface AchievementControlBarProps {
  tiles: readonly AchievementTile[];
  filters: AchievementFilters;
  onFiltersChange: (next: AchievementFilters) => void;
  view: AchievementView;
  onViewChange: (view: AchievementView) => void;
  density: AchievementDensity;
  onDensityChange: (density: AchievementDensity) => void;
  /** How many tiles the current filters produce, for the live region. */
  resultCount: number;
  /** Total in the catalogue, so the region can say "12 of 20". */
  totalCount: number;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: AchievementFilters['status']; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'UNLOCKED', label: 'Unlocked' },
  { value: 'LOCKED', label: 'Locked' },
];

const SORT_OPTIONS: ReadonlyArray<{ value: AchievementSort; label: string }> = [
  { value: 'DEFAULT', label: 'Default' },
  { value: 'CLOSEST', label: 'Closest' },
  { value: 'RARITY', label: 'Rarity' },
  { value: 'RECENT', label: 'Recent' },
  { value: 'NAME', label: 'A–Z' },
];

const VIEW_OPTIONS: ReadonlyArray<{
  value: AchievementView;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { value: 'SHELVES', label: 'Shelves', icon: Rows3 },
  { value: 'GRID', label: 'Grid', icon: LayoutGrid },
  { value: 'LIST', label: 'List', icon: List },
];

const selectClass =
  'rounded-md border border-[var(--ach-hairline)] bg-[var(--ach-surface-1)] px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[var(--ach-hairline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

const segmentClass =
  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100';

export function AchievementControlBar({
  tiles,
  filters,
  onFiltersChange,
  view,
  onViewChange,
  density,
  onDensityChange,
  resultCount,
  totalCount,
}: AchievementControlBarProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);

  const counts = {
    total: tiles.length,
    unlocked: tiles.filter((t) => t.unlocked).length,
    locked: tiles.filter((t) => !t.unlocked).length,
  };

  const filtersActive = !isDefaultFilters(filters);

  /*
    `/` focuses search, and `1`-`5` toggle rarity, but only when the user is not
    already typing. Without the guard, typing "3" into the search box would filter
    the gallery instead of searching for "3" - which is the single most annoying
    version of this feature.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const index = Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= RARITY_ORDER.length) {
        const rarity = RARITY_ORDER[index - 1];
        if (!rarity) return;
        event.preventDefault();
        onFiltersChange({ ...filters, rarity: filters.rarity === rarity ? 'ALL' : rarity });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filters, onFiltersChange]);

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            type="search"
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
            placeholder="Search badges"
            aria-label="Search badges by name or description"
            className={cn(
              'w-full rounded-md border border-[var(--ach-hairline)] bg-[var(--ach-surface-1)] py-1.5 pl-8 pr-8 text-xs text-foreground transition-colors placeholder:text-muted-foreground/70 focus-visible:border-[var(--ach-hairline-strong)]',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60'
            )}
          />
          {filters.query !== '' && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, query: '' })}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-[var(--ach-surface-2)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Status */}
        <div
          className="ach-panel-inset flex items-center gap-0.5 rounded-lg p-1"
          role="group"
          aria-label="Filter by unlock status"
        >
          {STATUS_OPTIONS.map((option) => {
            const active = filters.status === option.value;
            const count =
              option.value === 'ALL'
                ? counts.total
                : option.value === 'UNLOCKED'
                  ? counts.unlocked
                  : counts.locked;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onFiltersChange({ ...filters, status: option.value })}
                aria-pressed={active}
                className={cn(
                  segmentClass,
                  active
                    ? 'bg-[var(--ach-surface-1)] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
                <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Rarity */}
        <label className="sr-only" htmlFor="ach-rarity">
          Filter by rarity
        </label>
        <select
          id="ach-rarity"
          className={selectClass}
          value={filters.rarity}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              rarity: event.target.value as AchievementFilters['rarity'],
            })
          }
        >
          <option value="ALL">All rarities</option>
          {Object.entries(ACHIEVEMENT_RARITIES).map(([key, config]) => (
            <option key={key} value={key}>
              {config.icon} {config.label}
            </option>
          ))}
        </select>

        {/* Category */}
        <label className="sr-only" htmlFor="ach-category">
          Filter by category
        </label>
        <select
          id="ach-category"
          className={selectClass}
          value={filters.category}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              category: event.target.value as AchievementFilters['category'],
            })
          }
        >
          <option value="ALL">All categories</option>
          {Object.entries(ACHIEVEMENT_CATEGORIES).map(([key, config]) => (
            <option key={key} value={key}>
              {config.icon} {config.label}
            </option>
          ))}
        </select>

        {/* Sort */}
        <label className="sr-only" htmlFor="ach-sort">
          Sort badges
        </label>
        <select
          id="ach-sort"
          className={selectClass}
          value={filters.sort}
          onChange={(event) =>
            onFiltersChange({ ...filters, sort: event.target.value as AchievementSort })
          }
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* View */}
        <div
          className="ach-panel-inset flex items-center gap-0.5 rounded-lg p-1"
          role="group"
          aria-label="Choose layout"
        >
          {VIEW_OPTIONS.map((option) => {
            const active = view === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onViewChange(option.value)}
                aria-pressed={active}
                title={option.label}
                className={cn(
                  'rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none',
                  active
                    ? 'bg-[var(--ach-surface-1)] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* Density */}
        <div
          className="ach-panel-inset flex items-center gap-0.5 rounded-lg p-1"
          role="group"
          aria-label="Tile density"
        >
          {(['COMFORTABLE', 'COMPACT'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onDensityChange(option)}
              aria-pressed={density === option}
              className={cn(
                segmentClass,
                density === option
                  ? 'bg-[var(--ach-surface-1)] text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option === 'COMFORTABLE' ? 'Roomy' : 'Tight'}
            </button>
          ))}
        </div>

        {/* Disabled rather than hidden when nothing is active: a control that is
            sometimes there and sometimes not is a moving target. */}
        <button
          type="button"
          onClick={() =>
            onFiltersChange({
              status: 'ALL',
              rarity: 'ALL',
              category: 'ALL',
              sort: 'DEFAULT',
              query: '',
            })
          }
          disabled={!filtersActive}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none',
            filtersActive
              ? 'text-foreground hover:bg-[var(--ach-surface-2)]'
              : 'cursor-not-allowed text-muted-foreground/50'
          )}
        >
          <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>
      </div>

      {/*
        Announced on every filter change, which is the only way a screen-reader user
        learns that a filter did something. Polite, so it never interrupts.
      */}
      <p aria-live="polite" className="sr-only">
        {resultCount} of {totalCount} badges shown
      </p>

      {/* Keyboard affordance, visible but not shouty, and only when it applies. */}
      <p className="text-[11px] text-muted-foreground/80">
        Press <kbd className="rounded border border-border px-1">/</kbd> to search,{' '}
        <kbd className="rounded border border-border px-1">1</kbd>–
        <kbd className="rounded border border-border px-1">{RARITY_ORDER.length}</kbd> to filter by
        rarity
      </p>
    </div>
  );
}

export type { AchievementCategory, AchievementRarity };