'use client';

import { useCallback, useMemo, useRef } from 'react';
import { Pencil } from 'lucide-react';
import type { DayType } from '@/generated/prisma';
import type { DayTypeDefinition } from '@/types/routine';
import { routineTabKey } from '@/lib/routine/day-type-identity';
import { dayTypeValueOf } from './useDayTypes';
import { cn } from '@/lib/utils';

/**
 * Day-type tabs with real tab semantics.
 *
 * `role="tablist"` / `tab` / `tabpanel`, arrow-key navigation with a roving
 * tabindex, and Home/End. The previous strip was a row of `<button role="tab">`
 * elements inside a `role="tablist"` with **no** `aria-controls`, no
 * `tabindex` management and no key handling, so a screen-reader user tabbing
 * through the page had no idea which tab was selected or what it controlled.
 *
 * ## The edit pencil is a sibling, never a child
 *
 * An interactive element nested inside a `<button>` is invalid HTML and is
 * unreachable by keyboard in several browser/screen-reader combinations. The
 * pencil is a separate button in a flex row beside the tab.
 */
export interface DayTypeTab {
  /** `DayTypeDefinition.id`. Absent only for a canonical fallback tab. */
  dayTypeId?: string | null;
  value: DayType;
  label: string;
  color?: string | null;
  icon?: string | null;
  /**
   * Blocks in this day type's template, or `null` when it is not known.
   *
   * `null` is a real value, not "zero". Only the day type this date resolves to
   * has a known count — the page loads one date, not every template — so the
   * other tabs deliberately show no number rather than a `0` that would read as
   * "this day type is empty".
   */
  blockCount: number | null;
  /** True for the day type this date actually resolves to. */
  isToday?: boolean;
}

export function DayTypeTabs({
  tabs,
  definitions,
  selectedKey,
  onSelect,
  onEdit,
  panelId,
  isLoading,
}: {
  tabs: DayTypeTab[];
  /** The rows behind the editable tabs, so the pencil has a row to open. */
  definitions: DayTypeDefinition[];
  selectedKey: string | null;
  onSelect: (tab: DayTypeTab) => void;
  onEdit: (definition: DayTypeDefinition) => void;
  panelId: string;
  isLoading: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions]
  );

  const move = useCallback(
    (from: number, delta: number) => {
      const target = (from + delta + tabs.length) % tabs.length;
      const tab = tabs[target];
      if (!tab) return;
      onSelect(tab);
      // Move focus with the selection, which is what a roving tabindex is for:
      // the next Tab press lands after the strip, not back on the tab list.
      const node = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target];
      node?.focus();
    },
    [tabs, onSelect]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          move(index, 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          move(index, -1);
          break;
        case 'Home':
          event.preventDefault();
          move(0, 0);
          break;
        case 'End':
          event.preventDefault();
          move(tabs.length - 1, 0);
          break;
        default:
          break;
      }
    },
    [move, tabs.length]
  );

  return (
    <div className="relative">
      {/*
        Edge fades, on a wrapper with `overflow-x-auto` rather than on the body.
        Scroll containers are the only place a fade can sit without producing a
        horizontal page scrollbar at 360px.

        `.scrollbar-none` hides the *track* only — wheel, touch, keyboard and
        drag all still scroll, and the fade is what tells you there is more to
        see. The previous `[scrollbar-width:thin]` was Firefox-only, so Chrome
        and Safari drew a visible scrollbar straight through the header.
      */}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Routine day type"
        aria-busy={isLoading}
        className="scrollbar-none scroll-fade-x -mx-2 flex gap-2 overflow-x-auto px-2 py-1"
      >
        {tabs.map((tab, index) => {
          const key = routineTabKey(tab);
          const selected = key === selectedKey;

          return (
            <div key={key} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                role="tab"
                id={`routine-tab-${key.replace(/[^a-zA-Z0-9]/g, '-')}`}
                aria-selected={selected}
                aria-controls={panelId}
                // Roving tabindex: only the selected tab is in the tab order.
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(tab)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-sm transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  selected
                    ? 'border-primary/40 bg-primary/10 text-primary shadow-soft'
                    : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground'
                )}
                style={
                  selected && tab.color
                    ? { borderColor: tab.color, color: tab.color }
                    : undefined
                }
              >
                {tab.icon && (
                  <span aria-hidden="true" className="text-base leading-none">
                    {tab.icon}
                  </span>
                )}
                <span className="sr-only">{tab.label}, day type tab</span>
                <span aria-hidden="true">{tab.label}</span>
                {tab.blockCount !== null && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                      selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {tab.blockCount}
                  </span>
                )}
                {tab.isToday && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Today
                  </span>
                )}
              </button>

              {/*
                Sibling control, never nested inside the tab button. Visible on
                focus and on hover; always in the keyboard order so it is not a
                hover-only feature.
              */}
              {tab.dayTypeId && byId.has(tab.dayTypeId) && (
                <button
                  type="button"
                  onClick={() => {
                    const definition = tab.dayTypeId ? byId.get(tab.dayTypeId) : undefined;
                    if (definition) onEdit(definition);
                  }}
                  aria-label={`Edit the ${tab.label} day type`}
                  className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Build the strip's tabs from the definitions plus the known block counts. */
export function buildDayTypeTabs(
  definitions: DayTypeDefinition[],
  blockCounts: Map<string, number>,
  resolvedDayTypeId: string | null
): DayTypeTab[] {
  return definitions
    .filter((definition) => !definition.isArchived)
    .map((definition) => ({
      dayTypeId: definition.id,
      value: dayTypeValueOf(definition),
      label: definition.name,
      color: definition.color,
      icon: definition.icon,
      // `null` for a day type whose count is not loaded — the tab then shows no
      // number at all rather than a misleading `0`.
      blockCount: blockCounts.get(definition.id) ?? null,
      isToday: definition.id === resolvedDayTypeId,
    }));
}