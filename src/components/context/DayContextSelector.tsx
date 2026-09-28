'use client';

/**
 * DayContextSelector — pick the active routine Day Type for a date.
 *
 * Despite the component name, this control selects a routine `DayType` (the
 * schedule that applies), NOT the reflection-derived life context in
 * `lib/context`. It used to declare its own local `DayContext` union that was a
 * structural clone of the Prisma `DayType` enum — a fifth day-type taxonomy
 * that could silently drift from the schema. It now uses the real enum.
 *
 * Which day type is *active* for a date is decided server-side by the single
 * canonical resolver, `lib/scheduling/resolve-routine.ts`; this control only
 * writes a per-date override (`RoutineException`).
 *
 * Built-in `DayType` values are not the whole story: users define their own
 * day types ("College Day"), and those live in `DayTypeDefinition` and collapse
 * to the single enum value `CUSTOM`. The picker therefore takes an `options`
 * prop carrying the user's definitions; without it a custom day type could be
 * saved but was never displayed or re-selected, so it looked like the change
 * had done nothing.
 *
 * Usage:
 *   <DayContextSelector value={dayType} dayTypeId={id} onChange={setDayType} />
 */

/** A user's own day type, as returned by `GET /api/day-types?active=true`. */
export interface CustomDayType {
  id: string;
  name: string;
  /** Normalized identifier; resolves to the `DayType` enum value. */
  slug: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
}

export interface DayTypeOption {
  /** Enum value to persist, or `CUSTOM` for a user-defined day type. */
  value: DayType;
  label: string;
  hint: string;
  /** Only set for user-defined day types. */
  dayTypeId?: string;
}

import { Battery, Briefcase, GraduationCap, Plane, Settings, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DayType } from '@/generated/prisma';
import { enumValueForSlug } from '@/constants/day-types';

export const BUILT_IN_DAY_TYPE_OPTIONS: ReadonlyArray<{
  value: DayType;
  label: string;
  hint: string;
}> = [
  { value: 'WORKDAY', label: 'Workday', hint: 'Standard productivity day' },
  { value: 'WEEKEND', label: 'Weekend', hint: 'Relaxed schedule' },
  { value: 'HOLIDAY', label: 'Holiday', hint: 'Day off / festive' },
  { value: 'EXAM_DAY', label: 'Exam day', hint: 'High-stakes focus day' },
  { value: 'LOW_ENERGY', label: 'Low energy', hint: 'Scale back the load' },
  // Generic 'Custom' is only offered when the user has no definitions of their
  // own; otherwise it would sit next to the real ones and be meaningless.
  { value: 'CUSTOM', label: 'Custom', hint: 'Tailored to your plan' },
];

/** @deprecated Use `BUILT_IN_DAY_TYPE_OPTIONS`; kept for the fallback import path. */
export const DAY_TYPE_OPTIONS = BUILT_IN_DAY_TYPE_OPTIONS;

export interface DayContextSelectorProps {
  value?: DayType;
  /** The active user-defined day type, so the right custom option highlights. */
  dayTypeId?: string | null;
  onChange?: (option: { dayType: DayType; dayTypeId?: string }) => void;
  /** The user's own day types, from `GET /api/day-types?active=true`. */
  customDayTypes?: CustomDayType[];
  loading?: boolean;
  className?: string;
}

function iconFor(context: DayType): React.ReactNode {
  switch (context) {
    case 'WORKDAY':
      return <Briefcase className="h-5 w-5" />;
    case 'WEEKEND':
      return <Sun className="h-5 w-5" />;
    case 'HOLIDAY':
      return <Plane className="h-5 w-5" />;
    case 'EXAM_DAY':
      return <GraduationCap className="h-5 w-5" />;
    case 'LOW_ENERGY':
      return <Battery className="h-5 w-5" />;
    case 'CUSTOM':
      return <Settings className="h-5 w-5" />;
  }
}

export function DayContextSelector({
  value,
  dayTypeId,
  onChange,
  customDayTypes = [],
  loading = false,
  className,
}: DayContextSelectorProps) {
  const selected = value ?? 'WORKDAY';

  // The user's own day types, and ONLY those, when they have any.
  //
  // This used to prepend the six built-in enum labels unconditionally, so
  // `/today` offered "Workday / Weekend / Holiday / Exam day / Low energy /
  // Custom" while `/routine` showed the actual `DayTypeDefinition` names
  // ("Work Day / Weekend / Holiday / Exam Day / Low Energy Day"). The two
  // screens listed different day types, which is the reported desync.
  //
  // Each option now carries the real enum value resolved from its slug, so
  // selecting "Work Day" persists `dayType: 'WORKDAY'` plus its id, instead of
  // the useless `CUSTOM` that every user day type was collapsed into.
  const options: DayTypeOption[] =
    customDayTypes.length > 0
      ? customDayTypes.map((d) => ({
          value: enumValueForSlug(d.slug),
          label: d.name,
          hint: d.description?.trim() || 'Your day type',
          dayTypeId: d.id,
        }))
      : // No definitions yet: offer the built-ins so the control is still usable.
        // `TodayDayType` renders an empty state with a link to /routine instead
        // of showing this, so a user with no day types is never misled.
        BUILT_IN_DAY_TYPE_OPTIONS.map((o) => ({ ...o }));

  return (
    <div className={cn('w-full', className)}>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Day type</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          // A custom day type is identified by its id, not its enum value:
          // every custom day type has `value === 'CUSTOM'`, so comparing enum
          // values alone highlighted whichever custom option came first.
          const active =
            option.dayTypeId !== undefined
              ? dayTypeId === option.dayTypeId
              : selected === option.value && !dayTypeId;
          return (
            <button
              key={option.dayTypeId ?? option.value}
              type="button"
              onClick={() =>
                // `option.value` is already the resolved enum value for a
                // definition-backed option and the plain enum otherwise, so
                // this is just `option.value`. It previously hardcoded
                // `'CUSTOM'` for anything with a `dayTypeId`, which erased
                // the distinction between a Work Day and a Weekend.
                onChange?.({ dayType: option.value, dayTypeId: option.dayTypeId })
              }
              aria-pressed={active}
              disabled={loading}
              // Semantic tokens only. This control was the last day-type surface
              // still using raw light-mode Tailwind colors (`bg-white`,
              // `text-gray-800`, `bg-blue-50`), so it rendered a white panel
              // with near-black text in dark mode — the reported theme bug.
              className={cn(
                'flex flex-col items-start gap-1.5 rounded-lg border px-3 py-3 text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:opacity-60',
                active
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-muted/60'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
                aria-hidden="true"
              >
                {iconFor(option.value)}
              </span>
              <span>
                <span className={cn('block text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>
                  {option.label}
                </span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Picking a day type saves a per-date override. Reset to return to the natural schedule.
      </p>
    </div>
  );
}

export default DayContextSelector;