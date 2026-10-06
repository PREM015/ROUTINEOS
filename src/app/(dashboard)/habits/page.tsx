'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AddHabitModal from '@/components/habits/AddHabitModal';
import EditHabitModal from '@/components/habits/EditHabitModal';
import { HabitContributionHeatmap } from '@/components/habits/HabitContributionHeatmap';
import { useApp, type Habit } from '@/context/AppContext';
import { getFrequencyLabel } from '@/lib/habits/frequency';
import { isHabitScheduledForDate } from '@/lib/habits/scheduling';
import { habitAppliesToDayType } from '@/lib/habits/day-type-match';
import type { DayType } from '@/generated/prisma';
import type { DayTypeDefinition } from '@/types/routine';
import { getTodayString } from '@/lib/dates';
import { Plus, Archive, Play, Pause, Target, Pencil, Trash2, RotateCcw, CheckCircle2, Circle, CircleSlash, CircleMinus, Flame, TrendingUp, Filter, Search, X, Bell } from 'lucide-react';
import { Button, EmptyState, Select, Modal } from '@/components/ui';
import { TagChip, type TagOption } from '@/components/habits/TagPicker';
import { cn } from '@/lib/utils';
import { fetchWithAuth } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { onAppEvent, notifyHabitsDataChanged } from '@/lib/app-events';


type TabType = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

/**
 * Sentinel for the "Today" entry in the day-type filter.
 *
 * A `DayTypeDefinition` id is a cuid, so a bare string sentinel can never
 * collide with a real one.
 */
const TODAY_FILTER = '__today__';
type TierType = 'GROWTH' | 'BONUS' | 'LIFESTYLE';

const TIER_LABELS: Record<TierType, string> = {
  GROWTH: 'Core Habits',
  BONUS: 'Growth Habits',
  LIFESTYLE: 'Lifestyle Habits',
};
const OTHER_TIERS = ['NON_NEGOTIABLE', 'FLEXIBLE', 'OPTIONAL', 'EXPERIMENTAL', 'ALTERNATIVE', 'SPECIAL', 'JUST_FOR_FUN', 'UNDEFINED'];

/**
 * A `Date`-only value, as opposed to a full timestamp.
 *
 * Anchored with `^`/`$` so a full ISO string cannot be mistaken for one: a bare
 * `slice` on `"2026-01-01T00:00:00Z"` would also produce a ten-character run.
 */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Which stored statuses a tab shows.
 *
 * Module scope, not component scope. Declared inside the component it was a NEW
 * object on every render, so any `useMemo` that reads it re-ran on every render —
 * which is why the memo's dependency list had to leave it out, and why that omission
 * was a real staleness hazard rather than a harmless shortcut.
 */
const STATUS_MAP: Record<TabType, string[]> = {
  ACTIVE: ['ACTIVE'],
  PAUSED: ['PAUSED'],
  ARCHIVED: ['ARCHIVED', 'COMPLETED'],
};

/**
 * Fallback accent per habit tier, used only when the user never picked a colour.
 *
 * Ties each tier to the palette the rest of the app already uses for it, so an
 * un-coloured habit still reads as "core" versus "bonus" at a glance instead of
 * every card looking identical.
 */
const TIER_ACCENT: Record<string, string> = {
  NON_NEGOTIABLE: '#ef4444',
  CORE: '#ef4444',
  GROWTH: '#3b82f6',
  BONUS: '#a855f7',
  LIFESTYLE: '#10b981',
  FLEXIBLE: '#06b6d4',
  EXPERIMENTAL: '#f59e0b',
  OPTIONAL: '#64748b',
};

interface HealthRow {
  habitId: string;
  name: string;
  completionRate: number | null;
  longestStreak: number;
  health: 'HEALTHY' | 'AT_RISK' | 'UNHEALTHY' | 'NO_DATA';
}

const HEALTH_BAR: Record<HealthRow['health'], string> = {
  HEALTHY: 'bg-emerald-500',
  AT_RISK: 'bg-amber-500',
  UNHEALTHY: 'bg-red-500',
  NO_DATA: 'bg-muted',
};

/**
 * Per-day appearance for a habit's `HabitLog` status.
 *
 * `HabitLogStatus` has five values and only one of them meant anything in the
 * row, so PARTIAL / SKIPPED / MISSED / NOT_APPLICABLE all rendered as the same
 * empty circle. `NONE` is the no-log case and is deliberately styled like a
 * neutral outline so "nothing logged" and "something logged that is not done"
 * stay distinguishable.
 */
type DayLogStatus = 'COMPLETED' | 'PARTIAL' | 'SKIPPED' | 'MISSED' | 'NOT_APPLICABLE' | 'NONE';

/**
 * `yyyy-MM-dd` for an instant, in the user's timezone.
 *
 * Two different shapes reach this function and they must be told apart:
 *
 * - `habit.startDate` / `endDate` are real timestamps and have to be shifted
 *   into the user's zone before taking the date part.
 * - A habit created through this page stores its dates as bare `yyyy-MM-dd`
 *   strings, and the repository returns them verbatim. Those are *calendar
 *   dates*, not instants: parsing `"2026-01-01"` with `new Date()` yields
 *   midnight UTC, which in any negative-offset zone is the previous local day.
 *   That made a habit whose start date was today report "Starts on yesterday" and
 *   render as Not due.
 *
 * So a bare date is returned untouched, and only a real timestamp is converted.
 */
function toDateKeyInZone(iso: string | null | undefined, timezone: string): string | null {
  if (!iso) return null;
  if (BARE_DATE.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const LOG_STATUS_STYLE: Record<DayLogStatus, { icon: React.ReactNode; className: string }> = {
  COMPLETED: { icon: <CheckCircle2 size={22} />, className: 'text-emerald-500' },
  PARTIAL: { icon: <CircleMinus size={22} />, className: 'text-amber-500 hover:text-amber-400' },
  SKIPPED: { icon: <CircleSlash size={22} />, className: 'text-sky-500 hover:text-sky-400' },
  MISSED: { icon: <Circle size={22} />, className: 'text-red-500 hover:text-red-400' },
  NOT_APPLICABLE: { icon: <CircleSlash size={22} />, className: 'text-muted-foreground' },
  NONE: { icon: <Circle size={22} />, className: 'text-muted-foreground hover:text-emerald-400' },
};

export default function HabitsPage() {
  const {
    habits, dataLoaded, dataError, reloadData,
    archiveHabit, restoreHabit, pauseHabit, resumeHabit, deleteHabit,
    getLogForDate, logHabit, selectedDate,
  } = useApp();
  const { timezone } = useUserTimezone();
  const [tab, setTab] = useState<TabType>('ACTIVE');
  const [dayTypeFilter, setDayTypeFilter] = useState<string | null>(null); // null = "All Days"
  const [dayTypes, setDayTypes] = useState<DayTypeDefinition[]>([]);
  const [dayTypesLoading, setDayTypesLoading] = useState(true);
  /** Free-text filter over name / description / tag names. */
  const [searchTerm, setSearchTerm] = useState('');
  /** Selected `Tag.id`, or null for "All tags". */
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  /** Day-type filter could not load; the dropdown is unusable until it does. */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 28-day health metrics could not load; the columns are blank until they do. */
  const [healthError, setHealthError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<HealthRow[]>([]);

  const today = selectedDate || getTodayString(timezone);

  /**
   * The concrete `DayTypeDefinition` id for the date being viewed, or `null`
   * when the user owns no definition for that day type.
   *
   * This powers the "Today" filter option. Without it the only way to answer
   * "which of my habits should I be doing right now?" was to open each day type
   * in the dropdown and compare by eye.
   */
  const [todayDayType, setTodayDayType] = useState<{
    id: string | null;
    name: string | null;
    /** The resolved `DayType` enum, needed to match day-type-restricted habits. */
    dayType: DayType | null;
  }>({ id: null, name: null, dayType: null });


  /*
   * The user's tags, for the filter dropdown and to resolve the ids on each
   * habit's join rows into labels.
   *
   * Derived from the habits themselves rather than a second request: every
   * tagged habit the context holds already carries its full `tag` object, so
   * this needs no fetch and cannot drift from what the list is showing. A tag
   * whose last habit was archived simply drops out of the filter, which is the
   * correct behaviour.
   */
  const allTags = useMemo(() => {
    const byId = new Map<string, TagOption>();
    for (const habit of habits) {
      for (const join of habit.tags ?? []) {
        if (join.tag && !byId.has(join.tagId)) {
          byId.set(join.tagId, {
            id: join.tagId,
            name: join.tag.name,
            color: join.tag.color,
            icon: join.tag.icon,
          });
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [habits]);

  /**
   * Label lookup for a habit's tag ids, so a chip can render a name even when
   * the join row's nested tag is missing.
   */
  const tagById = useMemo(() => new Map(allTags.map(t => [t.id, t])), [allTags]);

  const loadTodayDayType = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/day-mode?date=${today}`);
      if (!res.ok) return;
      const json = await res.json();
      setTodayDayType({
        id: json.data?.dayTypeId ?? null,
        name: json.data?.dayTypeName ?? null,
        dayType: json.data?.dayType ?? null,
      });
    } catch {
      // Non-fatal: the "Today" option is simply omitted when the day mode
      // cannot be resolved. Filtering by an explicit day type still works.
    }
  }, [today]);

  useEffect(() => {
    void loadTodayDayType();
  }, [loadTodayDayType]);

  // Cross-page synchronization: refresh today's day type when it changes on /today
  useEffect(() => {
    const cleanup = onAppEvent('today-data-changed', () => void loadTodayDayType());
    return cleanup;
  }, [loadTodayDayType]);

  const loadDayTypes = async () => {
    try {
      setDayTypesLoading(true);
      setLoadError(null);
      const res = await fetchWithAuth('/api/day-types?active=true');
      if (!res.ok) {
        throw new Error(`Could not load day types (status ${res.status})`);
      }
      const json = await res.json();
      const data: DayTypeDefinition[] = json.data || [];
      setDayTypes(data.filter((dt: DayTypeDefinition) => !dt.isArchived));
    } catch (error) {
      // Previously `console.error` only. A failure left the day-type filter
      // dropdown showing just "All Days" with no indication that filtering was
      // even unavailable, so the user could not tell a broken request from a
      // deliberately unfiltered list.
      setLoadError(
        error instanceof Error ? error.message : 'Could not load day types'
      );
    } finally {
      setDayTypesLoading(false);
    }
  };

  /*
    Fetch day types on mount.

    Declared BELOW `loadDayTypes` on purpose. It used to sit at the top of the
    component, above the `const loadDayTypes = …` it calls — a temporal dead zone
    read that works only because the effect body runs after the whole function
    body has evaluated. Move either one and it throws, which is a trap rather
    than a style preference.

    Mount-only, so the empty dependency array is the intent rather than an
    oversight: this reads the user's day-type definitions once and a manual
    refresh button owns every later change.
  */
  useEffect(() => {
    void loadDayTypes();
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/habits/health?days=28');
      if (!res.ok) {
        throw new Error(`Could not load habit health (status ${res.status})`);
      }
      const data = await res.json();
      if (data.success) {
        setHealthData(data.data.habits as HealthRow[]);
        setHealthError(null);
      } else {
        setHealthError(data.error || 'Could not load habit health');
      }
    } catch (err) {
      // The empty `catch` here meant the 28-day health columns silently
      // disappeared from every row with no message at all.
      setHealthError(
        err instanceof Error ? err.message : 'Could not load habit health'
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    fetchHealth();
  }, [fetchHealth]);

  const healthByHabit = useMemo(
    () => new Map(healthData.map(h => [h.habitId, h])),
    [healthData]
  );

  const healthSummary = useMemo(() => {
    const withRate = healthData.filter(h => h.completionRate !== null);
    const overall = withRate.length
      ? Math.round(withRate.reduce((s, h) => s + (h.completionRate as number), 0) / withRate.length)
      : null;
    return {
      overall,
      healthy: healthData.filter(h => h.health === 'HEALTHY').length,
      atRisk: healthData.filter(h => h.health === 'AT_RISK').length,
      unhealthy: healthData.filter(h => h.health === 'UNHEALTHY').length,
    };
  }, [healthData]);

  // Filter habits by day type: global habits (appliesEveryDay: true) + day-specific habits for selected day type
  const filteredHabits = useMemo(
    () => {
      let filtered = habits.filter(h => STATUS_MAP[tab].includes(h.status));

      // `TODAY_FILTER` is a sentinel, not an id: it resolves to whatever the
      // day type actually is for the date being viewed, which can change when
      // the user picks a different date or crosses midnight.
      const effectiveFilter =
        dayTypeFilter === TODAY_FILTER ? todayDayType.id : dayTypeFilter;

      if (effectiveFilter) {
        filtered = filtered.filter(h =>
          h.appliesEveryDay === true ||
          (h.dayTypeAssignments ?? []).some(dta => dta.dayTypeId === effectiveFilter)
        );
      }

      // Free-text search over name, description and tag names.
      //
      // `GET /api/habits?search=` is also supported (and was silently ignored
      // until the repository was fixed), but this is a client-side filter over
      // the habits the context already holds, so typing is instant and does not
      // re-request. It does mean it is scoped to the loaded set, which is
      // bounded — see the `totalLoaded` notice in the header.
      const term = searchTerm.trim().toLowerCase();
      if (term) {
        filtered = filtered.filter(h =>
          h.name.toLowerCase().includes(term) ||
          (h.description ?? '').toLowerCase().includes(term) ||
          (h.tags ?? []).some(t => t.tag?.name.toLowerCase().includes(term))
        );
      }

      if (tagFilter) {
        filtered = filtered.filter(h => (h.tags ?? []).some(t => t.tagId === tagFilter));
      }

      return filtered;
    },
    [habits, tab, dayTypeFilter, todayDayType.id, searchTerm, tagFilter]
  );

  /**
   * How many habits exist in this tab *before* search and tag filtering.
   *
   * Needed to tell "you have no habits in this tab" apart from "you have habits
   * but the current filters exclude all of them". Both render the same
   * `filteredHabits.length === 0`, and telling a user with 40 habits to
   * "Add your first habit" because they typed a search term that matched nothing
   * is exactly the kind of wrong-but-confident message this page has been
   * producing.
   */
  const statusCount = (t: TabType) =>
    habits.filter(h => STATUS_MAP[t].includes(h.status)).length;

  const clearFilters = () => {
    setSearchTerm('');
    setTagFilter(null);
    setDayTypeFilter(null);
  };

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      // `void` is deliberate: this is a refetch of already-rendered chrome, not
      // part of the action. Awaiting it would keep the row's buttons disabled
      // until the health query finished, and not marking it at all is what
      // produced the `no-floating-promises` lint error.
      void fetchHealth();
      notifyHabitsDataChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const toggleToday = (habit: Habit) => {
    const log = getLogForDate(habit.id, today);
    const next = log?.status === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
    return runAction(habit.id, () => logHabit(habit.id, today, next));
  };

  /**
   * Should this habit be completed on the date being viewed?
   *
   * Mirrors the server's `calculateHabitEligibility` for the parts that are
   * decidable from the habit record alone. The toggle used to be offered
   * unconditionally, so a `MONTHLY_TARGET` habit, a habit past its `endDate`, or
   * one restricted to "Weekend" all presented a clickable circle on a day they
   * were never due. Completing one earned a 400 from the server, and
   * *un*-completing one wrote a `MISSED` that silently depressed the habit's
   * 28-day rate and its streak.
   *
   * Deliberately conservative — it returns `true` (do not disable) whenever it
   * cannot decide, because a false "not due" would block a completion the server
   * would have accepted. Override rows (`SKIP_TODAY`, `PAUSE`, `RESCHEDULE`)
   * are not visible here, so they are not considered.
   */
  const notDueReason = (habit: Habit, date: string): string | null => {
    if (habit.status !== 'ACTIVE') return 'This habit is not active.';

    // Day-type restriction. Needs the resolved enum for the slug fallback, so
    // without it the answer is "cannot tell" rather than a guess.
    if (habit.appliesEveryDay === false) {
      if (!todayDayType.dayType) return null;
      if (
        !habitAppliesToDayType(habit, {
          dayType: todayDayType.dayType,
          dayTypeId: todayDayType.id,
        })
      ) {
        return `Restricted to ${(habit.dayTypeAssignments ?? [])
          .map(a => a.dayType?.name)
          .filter(Boolean)
          .join(', ') || 'other day types'}.`;
      }
    }

    // startDate / endDate, compared as calendar days in the user's timezone.
    const startDay = toDateKeyInZone(habit.startDate, timezone);
    if (startDay && date < startDay) return `Starts on ${startDay}.`;
    const endDay = habit.endDate ? toDateKeyInZone(habit.endDate, timezone) : null;
    if (endDay && date > endDay) return `Ended on ${endDay}.`;

    // Frequency. `isHabitScheduledForDate` reads the same fields the server
    // does, so the two cannot drift on cadence.
    if (!isHabitScheduledForDate(habit, date, timezone)) {
      return `Not scheduled for ${date}.`;
    }

    return null;
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    await runAction(id, () => deleteHabit(id));
  };

  const renderHabitRow = (habit: Habit) => {
    const log = getLogForDate(habit.id, today);
    const done = log?.status === 'COMPLETED';
    const busy = busyId === habit.id;
    const health = healthByHabit.get(habit.id);
    /*
     * The day's real log status, not a boolean.
     *
     * `getLogForDate` can return PARTIAL, SKIPPED, MISSED or NOT_APPLICABLE, and
     * the row used to collapse all four into "not done": an unchecked circle
     * labelled "Mark <name> done". So a habit the user had deliberately skipped
     * looked identical to one they had never touched, and the only way to find
     * out was to open /today. Each non-COMPLETED status now renders its own
     * glyph, colour and accessible name, and the label matches what clicking
     * will actually do.
     */
    const logStatus = log?.status;
    const isMarked = logStatus !== undefined;
    const notDue = notDueReason(habit, today);
    const stateLabel =
      logStatus === 'COMPLETED' ? 'done' :
      logStatus === 'PARTIAL' ? 'partly done' :
      logStatus === 'SKIPPED' ? 'skipped' :
      logStatus === 'MISSED' ? 'marked not done' :
      logStatus === 'NOT_APPLICABLE' ? 'not applicable' :
      'not done';
    /*
     * The habit's own colour, used for the leading rail and the avatar tint.
     *
     * `Habit.color` and `Habit.icon` have been capturable since the Add modal
     * first shipped and were never rendered anywhere: a user could pick "red" and
     * "🏃" and see no difference on any screen. `color-mix` against the card
     * token keeps a pastel choice legible in both themes instead of only the one
     * where that hex happens to have contrast — the white-on-white failure.
     */
    const accent = habit.color ?? TIER_ACCENT[habit.tier] ?? null;
    const rail = accent
      ? `linear-gradient(to bottom, ${accent}, color-mix(in oklab, ${accent} 25%, transparent))`
      : undefined;

    return (
      <motion.div
        key={habit.id}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 transition-colors hover:border-foreground/20 sm:p-4"
      >
        {rail && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1"
            style={{ background: rail }}
          />
        )}

        {tab === 'ACTIVE' ? (
          <button
            onClick={() => toggleToday(habit)}
            disabled={busy || Boolean(notDue)}
            aria-label={
              notDue
                ? `${habit.name} — ${notDue}`
                : done
                  ? `Mark ${habit.name} not done`
                  : `Mark ${habit.name} done`
            }
            aria-pressed={done}
            title={
              notDue
                ? notDue
                : done
                  ? 'Completed — click to undo'
                  : `Click to complete (currently ${stateLabel})`
            }
            className={cn(
              'mt-0.5 shrink-0 rounded-full p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-40',
              done && 'scale-105',
              !notDue && !done && 'hover:scale-110'
            )}
            style={
              !notDue && !done && accent
                ? { color: `color-mix(in oklab, ${accent} 70%, var(--foreground))` }
                : undefined
            }
          >
            {done ? <CheckCircle2 size={24} /> : LOG_STATUS_STYLE[logStatus ?? 'NONE'].icon}
          </button>
        ) : (
          /* Paused / Archived rows have no toggle, so the icon tile takes its
             place and keeps the title aligned with the Active tab. */
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-sm"
            style={
              accent
                ? { color: `color-mix(in oklab, ${accent} 70%, var(--foreground))` }
                : undefined
            }
          >
            {habit.icon ?? <Circle size={18} />}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                'min-w-0 truncate text-sm font-semibold sm:text-[15px]',
                done ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
            >
              {habit.name}
            </span>
            {isMarked && !done && (
              <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', LOG_STATUS_STYLE[logStatus ?? 'NONE'].className)}>
                {stateLabel}
              </span>
            )}
            {/* Why the toggle is disabled. A greyed-out circle with no
                explanation reads as "the app is broken"; this says the habit is
                simply not due on the date being viewed. */}
            {tab === 'ACTIVE' && notDue && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Not due
              </span>
            )}
            {(habit.streakCount ?? 0) > 0 && (
              <span
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-500"
                title={`Current streak: ${habit.streakCount} days`}
              >
                <Flame size={12} aria-hidden="true" /> {habit.streakCount}
              </span>
            )}
            {health?.longestStreak && health.longestStreak > (habit.streakCount ?? 0) && (
              <span
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground"
                title={`Longest streak ever: ${health.longestStreak} days`}
              >
                <TrendingUp size={12} aria-hidden="true" /> best {health.longestStreak}
              </span>
            )}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="truncate">{getFrequencyLabel(habit.frequencyType, habit.frequencyValue)}</span>
            {habit.targetCount ? <span>· target {habit.targetCount}</span> : null}
            {habit.reminderTime ? (
              <span className="inline-flex items-center gap-1">
                · <Bell size={11} aria-hidden="true" /> {habit.reminderTime}
              </span>
            ) : null}
            {habit.estimatedDuration ? <span>· {habit.estimatedDuration} min</span> : null}
          </p>

          {health?.completionRate !== null && health?.completionRate !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <div
                className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-valuenow={health.completionRate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${habit.name} 28-day completion`}
              >
                <motion.div
                  className={cn('h-full rounded-full', HEALTH_BAR[health.health])}
                  initial={{ width: 0 }}
                  animate={{ width: `${health.completionRate}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {health.completionRate}% · {health.health.toLowerCase().replace('_', ' ')}
              </span>
            </div>
          )}

          {habit.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{habit.description}</p>
          )}

          {/*
            Tags, then day types.

            Tag chips were the headline missing feature: the whole `Tag` /
            `HabitTag` / `tagIds` / `tagId`-filter path existed on the server and
            nothing in the client ever touched it, so a tag could only be
            attached by calling the API by hand and was never visible here.
          */}
          {(habit.tags ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {(habit.tags ?? []).map(join => {
                const tag = join.tag ?? tagById.get(join.tagId);
                if (!tag) return null;
                const active = tagFilter === join.tagId;
                return (
                  <TagChip
                    key={join.tagId}
                    tag={tag}
                    onClick={() => setTagFilter(active ? null : join.tagId)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setTagFilter(active ? null : join.tagId);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title={active ? `Clear the ${tag.name} filter` : `Filter by ${tag.name}`}
                    aria-label={
                      active
                        ? `Clear the ${tag.name} filter`
                        : `Filter by tag ${tag.name}`
                    }
                    className={active ? 'ring-1 ring-primary' : undefined}
                  />
                );
              })}
            </div>
          )}

          {/*
            Which Routine Day Types this habit belongs to.

            Without this the restriction was invisible: a habit assigned to
            "Weekend" simply did not appear on /today on a weekday and there was
            nothing on this page explaining why, so the natural conclusion was
            that the habit had been deleted or broken.
          */}
          {habit.appliesEveryDay === false && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {(habit.dayTypeAssignments ?? []).length === 0 ? (
                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  No day types selected — never scheduled
                </span>
              ) : (
                <>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {(habit.dayTypeAssignments ?? []).length === 1 ? 'Day type' : 'Day types'}
                  </span>
                  {(habit.dayTypeAssignments ?? []).map((dta) =>
                    dta.dayType ? (
                      <span
                        key={dta.dayTypeId}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                      >
                        {dta.dayType.icon && (
                          <span aria-hidden="true">{dta.dayType.icon}</span>
                        )}
                        {dta.dayType.name}
                      </span>
                    ) : null
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {tab === 'ACTIVE' && (
            <button
              onClick={() => runAction(habit.id, () => pauseHabit(habit.id))}
              disabled={busy}
              className="p-2.5 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-50"
              title="Pause habit"
              aria-label={`Pause ${habit.name}`}
            >
              <Pause size={15} />
            </button>
          )}
          {tab === 'PAUSED' && (
            <button
              onClick={() => runAction(habit.id, () => resumeHabit(habit.id))}
              disabled={busy}
              className="p-2.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-50"
              title="Resume habit"
              aria-label={`Resume ${habit.name}`}
            >
              <Play size={15} />
            </button>
          )}
          <button
            onClick={() => setEditing(habit)}
            disabled={busy}
            className="p-2.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition disabled:opacity-50"
            title="Edit habit"
            aria-label={`Edit ${habit.name}`}
          >
            <Pencil size={15} />
          </button>
          {tab !== 'ARCHIVED' ? (
            <button
              onClick={() => runAction(habit.id, () => archiveHabit(habit.id))}
              disabled={busy}
              className="p-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition disabled:opacity-50"
              title="Archive habit"
              aria-label={`Archive ${habit.name}`}
            >
              <Archive size={15} />
            </button>
          ) : (
            <>
              {/* Restore: archiving used to be a one-way door with no control
                  anywhere to undo it, so a mis-click hid a habit and its whole
                  history with no way back. */}
              <button
                onClick={() => runAction(habit.id, () => restoreHabit(habit.id))}
                disabled={busy}
                className="p-2.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-50"
                title="Restore habit"
                aria-label={`Restore ${habit.name}`}
              >
                <RotateCcw size={15} />
              </button>
              <button
                onClick={() => setConfirmDelete(habit)}
                disabled={busy}
                className="p-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition disabled:opacity-50"
                title="Delete habit permanently"
                aria-label={`Delete ${habit.name}`}
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </motion.div>
    );
  };

  const renderTierGroup = (tier: TierType) => {
    const tierHabits = filteredHabits.filter(h => h.tier === tier);
    if (tierHabits.length === 0) return null;
    const sorted = [...tierHabits].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div key={tier} className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">{TIER_LABELS[tier]}</h3>
        <div className="space-y-2">
          {sorted.map(renderHabitRow)}
        </div>
      </div>
    );
  };

  const otherHabits = filteredHabits.filter(h => OTHER_TIERS.includes(h.tier)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    // No local layout wrapper: this page lives in the `(dashboard)` route
    // group, so it inherits that group's shell (sidebar, header, skip link,
    // offline banner, footer, mobile nav, focus bar, celebration host, sleep
    // prompt). It previously sat outside the group and hand-rolled a
    // *different* `DashboardLayout` with a divergent nav set, so /habits — the
    // page every nav item links to — was missing SkipLink, OfflineBanner,
    // MobileNav, FloatingFocusBar, CelebrationHost and SleepPromptHost.
    <>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Habits</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>{habits.filter(h => h.status === 'ACTIVE').length} active habits</span>
            {healthData.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className={cn('font-medium', healthSummary.healthy > 0 && 'text-emerald-600 dark:text-emerald-400')}>
                  {healthSummary.healthy} healthy
                </span>
                <span className={cn('font-medium', healthSummary.atRisk > 0 && 'text-amber-600 dark:text-amber-400')}>
                  {healthSummary.atRisk} at risk
                </span>
                <span className={cn('font-medium', healthSummary.unhealthy > 0 && 'text-red-600 dark:text-red-400')}>
                  {healthSummary.unhealthy} unhealthy
                </span>
                {healthSummary.overall !== null && (
                  <span className="tabular-nums">{healthSummary.overall}% avg (28d)</span>
                )}
              </>
            )}
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus size={16} /> Add Habit
        </Button>
      </div>

      {/*
        The contribution system.

        Placed directly under the page header, above search and the tier columns,
        because it answers the question the rest of the page answers per habit:
        "am I actually consistent?" A user who opens /habits wants the year at a
        glance first and the individual list second.

        It is a self-fetching island, so nothing above it re-renders when a year is
        switched, and a failure inside it cannot take the habit list down - it
        renders its own inline error.
      */}
      <div className="mb-6">
        <HabitContributionHeatmap />
      </div>

      {actionError && (
        <p role="alert" className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          {actionError}
        </p>
      )}

      {/* Health metrics are supplementary, so this is a quiet inline note
          rather than a page-level error. The columns below are simply blank. */}
      {healthError && (
        <p className="mb-4 text-xs text-muted-foreground">
          <span className="text-destructive">{healthError}.</span>{' '}
          Health metrics are unavailable; everything else is unaffected.{' '}
          <button
            type="button"
            onClick={() => void fetchHealth()}
            className="font-semibold text-primary hover:underline"
          >
            Retry
          </button>
        </p>
      )}

      {/*
        Search + tag filter.

        Both are client-side over the habits the context already holds. The API
        supports `search` and `tagId` and the repository now honours them, but
        this page has no server state to page through (it renders the whole
        context array), so filtering here is instant and cannot leave the list
        showing a stale result set. The server-side options are used by the
        mobile/compact list in the same file, which does request per filter.
      */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search habits or tags…"
            aria-label="Search habits"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Tags</span>
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              aria-pressed={tagFilter === null}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                tagFilter === null
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground'
              )}
            >
              All
            </button>
            {allTags.map(t => (
              <TagChip
                key={t.id}
                tag={t}
                onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTagFilter(tagFilter === t.id ? null : t.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-pressed={tagFilter === t.id}
                aria-label={
                  tagFilter === t.id
                    ? `Clear the ${t.name} tag filter`
                    : `Filter by tag ${t.name}`
                }
                className={tagFilter === t.id ? 'ring-1 ring-primary' : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Day Type Filter + Status Tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Day Type Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Select
            value={dayTypeFilter || ''}
            onChange={(e) => setDayTypeFilter(e.target.value || null)}
            options={[
              { value: '', label: 'All Days' },
              ...(todayDayType.id
                ? [
                    {
                      value: TODAY_FILTER,
                      label: `Today · ${todayDayType.name ?? 'current day type'}`,
                    },
                  ]
                : []),
              ...dayTypes.map(dt => ({ value: dt.id, label: dt.name })),
            ]}
            disabled={dayTypesLoading || Boolean(loadError)}
            className="w-auto min-w-[180px]"
            aria-label="Filter by day type"
          />
          {loadError && (
            <button
              type="button"
              onClick={() => void loadDayTypes()}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Retry filter
            </button>
          )}
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit" role="tablist" aria-label="Habit status filter">
          {(['ACTIVE', 'PAUSED', 'ARCHIVED'] as TabType[]).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-8"
        >
          {/*
            `dataLoaded` gates the empty state.

            The context starts with `habits = []`, so on every first paint this
            branch matched and rendered "No active habits / Add your first
            habit" to users who already had dozens of them -- for as long as the
            fetch took. Only once the load has resolved (successfully or not) is
            an empty list actually empty. A failed load now says so rather than
            claiming the user owns nothing.
          */}
          {!dataLoaded ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading habits">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-[74px] rounded-xl border border-border bg-card animate-pulse" />
              ))}
            </div>
          ) : dataError ? (
            <EmptyState
              icon={<Target size={28} />}
              title="Could not load your habits"
              description={dataError}
              action={
                <Button onClick={() => void reloadData()} variant="primary" size="sm">
                  Try again
                </Button>
              }
            />
          ) : filteredHabits.length === 0 ? (
            <EmptyState
              icon={<Target size={28} />}
              title={
                statusCount(tab) === 0
                  ? tab === 'ACTIVE'
                    ? 'No active habits'
                    : tab === 'PAUSED'
                      ? 'No paused habits'
                      : 'No archived habits'
                  : 'No matching habits'
              }
              description={
                statusCount(tab) === 0
                  ? tab === 'ACTIVE'
                    ? 'Add your first habit to start tracking your consistency.'
                    : ''
                  : `None of your ${tab.toLowerCase()} habits match the current search and filters.`
              }
              action={
                statusCount(tab) === 0 && tab === 'ACTIVE' ? (
                  <Button onClick={() => setModalOpen(true)} variant="primary" size="sm">
                    <Plus size={14} /> Add Your First Habit
                  </Button>
                ) : statusCount(tab) > 0 ? (
                  <Button onClick={clearFilters} variant="secondary" size="sm">
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {(['GROWTH', 'BONUS', 'LIFESTYLE'] as TierType[]).map(tier => renderTierGroup(tier))}
              {otherHabits.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">More Habits</h3>
                  <div className="space-y-2">
                    {otherHabits.map(renderHabitRow)}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <AddHabitModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { void fetchHealth(); notifyHabitsDataChanged(); }}
      />
      <EditHabitModal
        habit={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { void fetchHealth(); notifyHabitsDataChanged(); }}
      />

      {/*
        Delete confirmation, on the shared `Modal`.

        This was a hand-rolled `role="alertdialog"` overlay. It declared the role
        and `aria-modal`, which is what a screen reader announces, but nothing
        implemented the rest of what the role promises: no focus trap, so Tab
        walked out into the page behind the overlay and the rest of the habit
        list stayed reachable and silently interactive; no Escape handler, so the
        only ways out were the Cancel button and clicking the backdrop; and no
        focus restoration, so dismissing it dropped focus back to `<body>` and
        the next Tab started from the top of the document.

        `Modal` does all of it — focus trap, Escape, initial focus, restore on
        close, scroll lock and `role="dialog"` wired to its own title id.
      */}
      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete habit?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          &ldquo;{confirmDelete?.name}&rdquo; and its history will be permanently
          removed. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
