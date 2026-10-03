'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useReducedMotion } from 'framer-motion';

import { useRoutineDay } from '@/hooks/useRoutineDay';
import { useNowMinutes } from '@/hooks/useNowMinutes';
import { useWeekPattern } from '@/hooks/useWeekPattern';
import { useDayOverrides } from '@/hooks/useDayOverrides';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { useSettings } from '@/hooks/useSettings';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

import { Button, Modal } from '@/components/ui';
import { DayTypeTabs, buildDayTypeTabs, type DayTypeTab } from '@/components/routine/DayTypeTabs';
import { DateStrip } from '@/components/routine/DateStrip';
import { RoutineHero } from '@/components/routine/RoutineHero';
import { RoutineTimeline } from '@/components/routine/RoutineTimeline';
import { NowNextCard } from '@/components/routine/NowNextCard';
import { DayShapeBar } from '@/components/routine/DayShapeBar';
import { WeekPattern } from '@/components/routine/WeekPattern';
import { DayTypePerformance } from '@/components/routine/DayTypePerformance';
import { DayOverrides } from '@/components/routine/DayOverrides';
import { CollapsibleRailCard } from '@/components/routine/CollapsibleRailCard';
import { appliesToSummary } from '@/components/routine/AppliesToCard';
import {
  dayTypeSummary,
  overridesSummary,
  weekSummary,
} from '@/lib/routine/rail-summaries';
import {
  ApplyToRangeDialog,
  ApplyToRangeTrigger,
} from '@/components/routine/ApplyToRange';
import { AppliesToCard } from '@/components/routine/AppliesToCard';
import { BlockEditor } from '@/components/routine/BlockEditor';
import { CompletionSheet } from '@/components/routine/CompletionSheet';
import { DayTypeEditor } from '@/components/routine/DayTypeEditor';
import {
  DayCompleteBanner,
  EmptyBlocksState,
  NoTemplateState,
  OfflineNotice,
  ReadOnlyNotice,
  RestDayBanner,
  RoutineErrorState,
  RoutineLoadingState,
  RailSkeleton,
  TabsSkeleton,
} from '@/components/routine/RoutineStates';
import { useDayTypes } from '@/components/routine/useDayTypes';

import { parseTabSelection, blockMatchesSelection, routineTabKey } from '@/lib/routine/day-type-identity';
import { summarizeDay, sortBlocks } from '@/lib/routine/timeline';
import { rollupByDayType, toWeekDays } from '@/lib/routine/week-pattern';
import { resolveRetroactiveEditDays, evaluateEditWindow } from '@/lib/routine/edit-window';
import { calendarDaysBetween, getTodayString, nextCalendarDay, previousCalendarDay } from '@/lib/dates';
import { minutesToTime, timeToMinutesExact } from '@/lib/routine/conflicts';
import { apiRequest, ApiError, apiErrorMessage } from '@/lib/api-client';
import type { ResolvedRoutineBlock, DayTypeDefinition } from '@/types/routine';
import type { DayType } from '@/generated/prisma';

/**
 * `/routine` — the time-and-schedule command centre.
 *
 * ## One request per date
 *
 * `useRoutineDay` owns `GET /api/routine/today?date=`. Everything on this page
 * is derived from that one payload plus `lib/routine/timeline`'s pure functions.
 * The previous page asked for `/api/routine` (every template, every day type) and
 * `/api/routine/today` separately, and the debug panel asked for a third.
 *
 * ## Date and day type live in the URL
 *
 * `?date=YYYY-MM-DD&day=<selectionKey>`, so the page is deep-linkable and
 * survives a reload. Reading them from `useSearchParams` (not `useState`) is what
 * makes the browser's back button work across dates.
 */
export default function RoutinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { timezone } = useUserTimezone();
  const { settings } = useSettings();
  const online = useOnlineStatus();
  const dayTypes = useDayTypes();
  const now = useNowMinutes(timezone);
  const reduceMotion = useReducedMotion();

  const today = now.today ?? getTodayString(timezone);
  const timeFormat24h = settings?.timeFormat !== '12H';
  const animationsEnabled = settings?.animationsEnabled !== false;

  const date = searchParams.get('date') ?? today;
  const selection = parseTabSelection(searchParams.get('day'));

  const { data, isLoading, error, refetch, setLog, pendingBlockIds } = useRoutineDay(date);
  const isToday = date === today;

  // ── Local UI state ────────────────────────────────────────────────────────
  const [editor, setEditor] = useState<
    | { mode: 'create'; start?: string; end?: string }
    | { mode: 'edit'; block: ResolvedRoutineBlock }
    | null
  >(null);
  const [completionBlock, setCompletionBlock] = useState<ResolvedRoutineBlock | null>(null);
  const [dayTypeEditor, setDayTypeEditor] = useState<DayTypeDefinition | null>(null);
  const [dayTypeEditorOpen, setDayTypeEditorOpen] = useState(false);
  const [dayModeOpen, setDayModeOpen] = useState(false);
  const [applyRangeOpen, setApplyRangeOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ResolvedRoutineBlock | null>(null);

  const blocks = useMemo(() => data?.blocks ?? [], [data?.blocks]);
  const summary = useMemo(() => summarizeDay(blocks), [blocks]);

  /** Clock minutes, only on today's date. `null` elsewhere, by design. */
  const nowMinutes = isToday ? now.minutes : null;

  // ── Derived day-type identity ─────────────────────────────────────────────
  const resolvedDayTypeId = data?.dayTypeId ?? null;

  /**
 * Block counts per day type.
 *
 * Only **one** day's blocks are ever loaded — that is the whole point of the
 * single-request design — so the only count that can be known for certain is the
 * resolved day type's, for the selected date. Every other tab's count is
 * `undefined`, and the tab renders no number.
 *
 * Showing `0` for them would be a lie with real consequences: a user with twelve
 * blocks on "Weekend" would see "Weekend 0" and conclude the day type was empty.
 * The alternative — fetching every template just to fill in tab labels — is the
 * all-templates request this page deliberately removed.
 */
const blockCountsByDayType = useMemo(() => {
  const counts = new Map<string, number>();
  if (resolvedDayTypeId) {
    counts.set(resolvedDayTypeId, blocks.length);
  }
  return counts;
}, [resolvedDayTypeId, blocks.length]);

  const tabs = useMemo(
    () => buildDayTypeTabs(dayTypes.active, blockCountsByDayType, resolvedDayTypeId),
    [dayTypes.active, blockCountsByDayType, resolvedDayTypeId]
  );

  /**
   * The tab to show.
   *
   * An explicit `?day=` wins. Otherwise the tab for the day type this date
   * actually resolves to — which is what makes the strip a *view* of the date
   * rather than a picker that silently disagrees with it. Only when the resolved
   * day type has no tab does it fall back to the first one.
   */
  const activeTab: DayTypeTab | null = useMemo(() => {
    if (tabs.length === 0) return null;
    if (selection) {
      const match = tabs.find((tab) => routineTabKey(tab) === selection);
      if (match) return match;
    }
    if (resolvedDayTypeId) {
      const match = tabs.find((tab) => tab.dayTypeId === resolvedDayTypeId);
      if (match) return match;
    }
    return tabs[0] ?? null;
  }, [tabs, selection, resolvedDayTypeId]);

  /** True when the tab on screen differs from the day type the date resolves to. */
  const viewingOtherDayType = useMemo(
    () => Boolean(selection && activeTab && routineTabKey(activeTab) !== selection),
    [selection, activeTab]
  );

  /*
    The switched-to tab's blocks, fetched on demand.

    Keyed by `dayTypeId` and guarded by the day type it was requested for, so a
    response that lands after the user has clicked a different tab is discarded
    instead of painting under the wrong name. Cleared when the tab returns to the
    resolved day type, so switching back does not show a stale preview for one
    frame.
  */
  const [preview, setPreview] = useState<{
    dayTypeId: string;
    blocks: ResolvedRoutineBlock[];
  } | null>(null);
  const previewDayTypeId = preview?.dayTypeId ?? null;
  const previewBlocks = preview?.blocks ?? null;

  const previewKey = viewingOtherDayType ? activeTab?.dayTypeId ?? null : null;

  /*
    In flight, derived rather than stored.

    A stored `loading` flag would need clearing at the top of the effect — a
    synchronous setState, which is a cascading render and a lint warning. Deriving
    it from "the preview does not match the tab we want" gives the same answer
    with no extra state and no way for the two to disagree.
  */
  const previewInFlight = previewKey !== null && previewDayTypeId !== previewKey;

  useEffect(() => {
    if (!previewKey) return;
    let cancelled = false;

    void (async () => {
      try {
        const list = await apiRequest<unknown[]>(
          `/api/routine/templates?dayTypeId=${encodeURIComponent(previewKey)}`
        );
        if (cancelled) return;
        const template = list?.[0] as
          | { blocks?: ResolvedRoutineBlock[]; dayTypeId?: string | null }
          | undefined;
        const templateBlocks = Array.isArray(template?.blocks) ? template.blocks : [];
        // Only paint if this is still the tab we asked for.
        if (cancelled) return;
        setPreview({ dayTypeId: previewKey, blocks: templateBlocks });
      } catch {
        // A failed preview leaves the empty state, which is honest: we could not
        // load that day type, so we do not claim it is empty.
        if (!cancelled) setPreview({ dayTypeId: previewKey, blocks: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewKey]);

  /**
   * Blocks for the visible tab.
   *
   * Two sources, because the date resolves to ONE day type:
   *
   *  - the resolved day type's blocks, already in `data.blocks`;
   *  - for a tab the user deliberately switched to, that tab's own template,
   *    fetched on demand.
   *
   * The second source did not exist. Every non-resolved tab rendered "no blocks"
   * unconditionally, which meant a user who set Friday to Placement, then clicked
   * "College" on the strip, was told College was empty while College sat in the
   * URL as a deep link that could never resolve. The page was honest about what
   * it had loaded and useless for what it implied: the strip is clickable, so a
   * click has to show something.
   *
   * Only the CLICKED tab is fetched, so this is one extra request on a deliberate
   * switch — not the all-templates request the single-request design removed.
   */
  const visibleBlocks = useMemo(() => {
    if (!activeTab) return [];
    if (activeTab.dayTypeId && activeTab.dayTypeId === resolvedDayTypeId) return blocks;
    if (viewingOtherDayType) {
      const fetched = previewBlocks;
      // Guard on identity: the preview belongs to the day type it was fetched
      // for, and a slow response must not paint under a tab the user has since
      // moved on from.
      if (
        activeTab.dayTypeId &&
        previewDayTypeId === activeTab.dayTypeId &&
        fetched
      ) {
        return fetched;
      }
      return [];
    }
    // The whole payload belongs to one template, so the identity that matters is
    // the template's own — a per-block field the resolver does not return.
    const identity = {
      dayType: data?.dayType ?? null,
      dayTypeId: data?.template?.dayTypeId ?? null,
    };
    return blockMatchesSelection(identity, routineTabKey(activeTab)) ? blocks : [];
  }, [
    blocks,
    activeTab,
    resolvedDayTypeId,
    viewingOtherDayType,
    data?.dayType,
    data?.template?.dayTypeId,
    previewBlocks,
    previewDayTypeId,
  ]);

  // ── URL state ─────────────────────────────────────────────────────────────
  const writeUrl = useCallback(
    (nextDate: string, nextDay: string | null) => {
      const params = new URLSearchParams();
      params.set('date', nextDate);
      if (nextDay) params.set('day', nextDay);
      router.replace(`/routine?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const selectDate = useCallback(
    (nextDate: string) => writeUrl(nextDate, activeTab ? routineTabKey(activeTab) : null),
    [writeUrl, activeTab]
  );

  const selectTab = useCallback(
    (tab: DayTypeTab) => writeUrl(date, routineTabKey(tab)),
    [writeUrl, date]
  );

  // ── Editability ───────────────────────────────────────────────────────────
  const retroactiveDays = resolveRetroactiveEditDays(settings?.retroactiveEditDays);
  const windowDecision = evaluateEditWindow(date, today, retroactiveDays);
  const readOnly = !windowDecision.allowed;
  // Read-only means "this date is too far in the past to change", and nothing
  // else. `evaluateEditWindow` reports `allowed: true` for today *and* for every
  // future date (`daysAgo` is negative), so planning ahead stays writable — which
  // it has to be, or the forward half of the page is decorative. An earlier
  // version of this line nested the conditions and left future dates read-only.

  // ── Block actions ─────────────────────────────────────────────────────────
  const notify = useCallback((message: string) => toast.success(message), []);

  const toggleDone = useCallback(
    async (block: ResolvedRoutineBlock) => {
      const wasDone = block.log?.status === 'COMPLETED';

      // Untick removes the row rather than writing MISSED, so "Undo" is real
      // undo. Writing MISSED would need a second undo to get back to nothing.
      const ok = await setLog(block.id, wasDone ? { clear: true } : { status: 'COMPLETED' });

      if (!ok) {
        toast.error('Not saved — check your connection.');
        return;
      }

      if (wasDone) {
        toast.success(`Un-ticked ${block.title}`);
        return;
      }

      toast.success(`${block.title} done`, {
        action: {
          label: 'Undo',
          onClick: () => {
            void setLog(block.id, { clear: true });
          },
        },
      });
    },
    [setLog]
  );

  const startBlock = useCallback(
    async (block: ResolvedRoutineBlock) => {
      const ok = await setLog(block.id, { status: 'IN_PROGRESS' });
      if (!ok) {
        toast.error('Not saved — check your connection.');
        return;
      }
      toast.success(`${block.title} started`);
    },
    [setLog]
  );

  const nudge = useCallback(
    async (block: ResolvedRoutineBlock, deltaMinutes: number) => {
      try {
        const start = timeToMinutesExact(block.startTime) + deltaMinutes;
        const length = timeToMinutesExact(block.endTime) - timeToMinutesExact(block.startTime);
        const duration = length > 0 ? length : length + 1440;
        const newStart = ((start % 1440) + 1440) % 1440;
        const nextStart = minutesToTime(newStart);
        const nextEnd = minutesToTime(newStart + duration);
        if (!nextStart || !nextEnd) return;

        const result = await apiRequest<{ warnings?: Array<{ message: string }> }>('/api/routine', {
          method: 'PUT',
          body: { id: block.id, startTime: nextStart, endTime: nextEnd },
        });

        await refetch();
        const warning = result?.warnings?.[0]?.message;
        toast.success(warning ? `Moved. ${warning}` : `Moved ${block.title} ${deltaMinutes > 0 ? 'later' : 'earlier'}`);
      } catch {
        toast.error('Could not move this block');
      }
    },
    [refetch]
  );

  // Hoisted so it is a plain identifier: an optional-chained expression in a
  // `useCallback` dependency list defeats the compiler's manual-memoization
  // check and silently deoptimises the callback.
  const targetDayTypeId = activeTab?.dayTypeId ?? null;

  const duplicate = useCallback(
    async (block: ResolvedRoutineBlock) => {
      try {
        let start: number;
        let end: number;
        try {
          start = timeToMinutesExact(block.startTime) + 30;
          end = timeToMinutesExact(block.endTime) + 30;
        } catch {
          return;
        }
        const nextStart = minutesToTime(start);
        const nextEnd = minutesToTime(end > start ? end : end + 1440);
        if (!nextStart || !nextEnd) return;

        await apiRequest('/api/routine', {
          method: 'POST',
          body: {
            title: `${block.title} (copy)`,
            startTime: nextStart,
            endTime: nextEnd,
            categoryId: block.categoryId,
            color: block.color,
            icon: block.icon,
            energyLevel: block.energyLevel,
            trackCompletion: block.trackCompletion,
            description: block.description,
            notes: block.notes,
            ...(targetDayTypeId && { dayTypeId: targetDayTypeId }),
            // F6: duplicates are creates, so the edit window applies to them too.
            date,
          },
        });

        await refetch();
        toast.success('Block duplicated');
      } catch {
        toast.error('Could not duplicate this block');
      }
    },
    /*
      `date` IS a dependency and was missing from this list.

      The body sends `date` so the service can enforce the F6 retroactive edit
      window, but the callback captured whatever `date` was when the list was last
      built. Navigate to another day and duplicate a block, and the request would
      carry the OLD date — so the window check validated against the wrong day and
      either wrongly refused a legitimate edit or, worse, allowed one that should
      have been locked. `confirmDelete` right below already listed it; this one
      did not, and the two callbacks disagreed about the same value.
    */
    [targetDayTypeId, refetch, date]
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const title = pendingDelete.title;
    setPendingDelete(null);
    try {
      await apiRequest('/api/routine', {
        method: 'DELETE',
        // F6: the delete carries the date context so the service can refuse to
        // remove a block out from under a date the user has already locked.
        body: { id: pendingDelete.id, date },
      });
      await refetch();
      toast.success(`Deleted ${title}`);
    } catch (error) {
      // A closed edit window answers 403, and that is a different problem from a
      // failed write — say which, rather than reporting both as "could not".
      toast.error(
        error instanceof ApiError && error.status === 403
          ? 'This date is outside your editable window'
          : 'Could not delete this block'
      );
    }
  }, [pendingDelete, refetch, date]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing) return;

      switch (event.key.toLowerCase()) {
        case 'n':
          event.preventDefault();
          if (!readOnly) setEditor({ mode: 'create' });
          break;
        case 't':
          event.preventDefault();
          writeUrl(today, activeTab ? routineTabKey(activeTab) : null);
          break;
        case 'arrowleft':
          event.preventDefault();
          selectDate(previousCalendarDay(date));
          break;
        case 'arrowright':
          event.preventDefault();
          selectDate(nextCalendarDay(date));
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [readOnly, writeUrl, today, activeTab, selectDate, date]);

  const trackedBlocks = useMemo(() => blocks.filter((block) => block.trackCompletion), [blocks]);

  /*
   * Completion, taken from the server rather than recomputed here.
   *
   * This used to count `blocks.filter(b => b.log?.status === 'COMPLETED')`, which
   * is only correct while every log belongs to the template this date resolves.
   * It does not: `RoutineLog` records only its `routineBlockId`, so changing the
   * day's day type afterwards re-points which blocks the date resolves and the
   * client's own count silently dropped to 0 for work the user had genuinely done.
   * The service attributes logs to the template they were written against
   * (`attributeLogsByTemplate`) and returns the corrected figures, so the ring reads
   * those instead of re-deriving a fourth, differently-broken number.
   *
   * `blocks` still drives every *interactive* concern — which blocks to render,
   * which one is tickable, what the completion sheet opens — because that is
   * genuinely about the current schedule.
   */
  const serverCompletedBlocks = data?.completedBlocks ?? 0;
  const offScheduleLogs = data?.offScheduleLogs ?? [];
  const hasOffScheduleWork = offScheduleLogs.length > 0;

  // When the day's work belongs to another schedule the server has already counted
  // it; fall back to the local count only for an ordinary day.
  const trackedDone = hasOffScheduleWork ? serverCompletedBlocks : trackedBlocks.filter(
    (block) => block.log?.status === 'COMPLETED'
  ).length;
  const trackedTotal = trackedBlocks.length;
  const completionRate = trackedTotal > 0 ? Math.round((trackedDone / trackedTotal) * 100) : 0;

  /*
   * The denominator `DailyScore.routineCompletionRate` actually uses.
   *
   * `scoring.service.ts:242-243` divides by `routineLogs.length` — the number of
   * `RoutineLog` rows that exist for the date — not by the number of scheduled
   * blocks and not by the number of tracked blocks. So a block nobody has touched
   * is excluded from the score entirely rather than counted as a failure, and a
   * day with no log rows at all scores 0.
   *
   * Deriving it here is what lets the rail say *why* its two percentages differ
   * instead of just printing both of them. `upsertLog` writes one row per
   * (userId, blockId, date), so blocks-with-a-log is the same count.
   */
  const loggedBlocks = useMemo(() => blocks.filter((block) => block.log != null).length, [blocks]);

  const minutesRemainingToday = useMemo(() => {
    if (!isToday || nowMinutes === null) return null;
    return blocks
      .filter((block) => block.trackCompletion && block.log?.status !== 'COMPLETED')
      .reduce((total, block) => {
        const start = minutesToTime(timeToMinutesExact(block.startTime));
        const end = minutesToTime(timeToMinutesExact(block.endTime));
        if (!start || !end) return total;
        const startMinutes = timeToMinutesExact(start);
        let endMinutes = timeToMinutesExact(end);
        if (endMinutes <= startMinutes) endMinutes += 1440;
        const remaining = endMinutes - Math.max(startMinutes, nowMinutes);
        return total + Math.max(0, remaining);
      }, 0);
  }, [blocks, isToday, nowMinutes]);

  const dayTypeDefinition = useMemo(
    () =>
      activeTab?.dayTypeId
        ? (dayTypes.active.find((definition) => definition.id === activeTab.dayTypeId) ?? null)
        : null,
    [activeTab, dayTypes.active]
  );

  /*
   * A3.1 / A3.2. One week fetch, two derivations, both pure.
   *
   * The anchor is the selected `date`, not "today", so a user parked on a date
   * three weeks back sees *that* week — the same rule the day view follows. The
   * hook refetches only when the Monday-start week actually changes, so arrowing
   * across a week is free.
   *
   * `today` is the timezone-corrected string from `useNowMinutes`, not
   * `new Date()`, so the strip marks the right day for a user whose local date
   * differs from the host's.
   */
  const week = useWeekPattern(date, timezone);
  const weekDays = useMemo(() => toWeekDays(week.data, today), [week.data, today]);
  const dayTypeRollups = useMemo(() => rollupByDayType(week.data), [week.data]);

  // A3.3. Fetched once on mount rather than per date: overrides are a property
  // of the user's history, not of the day being viewed, and the list splits
  // itself around `today` on the client.
  const overrides = useDayOverrides();

  const allDone = trackedTotal > 0 && trackedDone === trackedTotal;
  const showRestDay = data?.score.isRestDay === true;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full">
      {/*
        Background: a fixed mesh plus a fine grain, both behind the content and
        both disabled outright when the user has turned animations off or the OS
        asks for reduced motion. A static gradient is still decoration the user
        switched off, so it is removed rather than frozen.

        `fixed inset-0` rather than `absolute`. It used to be `absolute inset-0`
        of the page container, which meant the gradient covered exactly the
        content column and stopped dead at its edges — on a wide monitor or at a
        low zoom level that reads as a lit rectangle floating in black, with a
        hard seam down both sides. Fixed to the viewport, it covers the canvas
        and the column sits *inside* it, so there is no edge to see.
      */}
      {animationsEnabled && !reduceMotion && (
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div className="gradient-mesh-animated absolute inset-0 opacity-50" />
          <div className="grain-overlay absolute inset-0" />
        </div>
      )}

      {/*
        The content column.

        No `container` utility. It was here alongside `max-w-7xl`, and the two
        fight: Tailwind's `container` sets its own breakpoint `max-width`s while
        `max-w-7xl` sets a flat one, and which wins depends on stylesheet order
        rather than on anything readable in this attribute. Worse, 80rem is a
        hard ceiling, so on a 2560px monitor — or at 50% browser zoom, where the
        CSS viewport quadruples — the page became a narrow ribbon with dead space
        down both sides.

        The widths scale instead of capping: comfortable on a laptop, and it
        grows into a 4K display rather than sitting in the middle of it. `mx-auto`
        centres it, which is what makes the background read as a canvas rather
        than as a page.
      */}
      {/*
        The page column, as a flex chain with a definite height.

        ## Why this is a flex chain and not a stack of cards

        Every attempt to kill the void below the timeline was a fight, because
        nothing on the page had a height to divide up. The column had no height,
        so the panel could not fill it; the panel could not fill it, so a
        viewport-relative `max-h` was the only lever, and a `max-h` makes a short
        day stop short and leave the void *below the card* instead.

        The fix is to give the chain a height and let `flex-1` do the dividing:

          page column   min-h-[calc(100dvh - 3.5rem)] flex flex-col
            header / hero / date strip / tabs     shrink-0
            the grid                             flex-1 min-h-0
              schedule column                    min-h-0 flex flex-col
                panel                            flex-1 min-h-0
                  scroll area                    flex-1 min-h-0 overflow-y-auto
                  shortcut dock                  shrink-0

        Every `min-h-0` is load-bearing. Without it a flex item's default
        `min-height: auto` refuses to shrink below its content, the panel grows
        past the viewport, and the page scrolls — which is the double-scroll that
        made the bottom item look clipped.

        The 3.5rem is the dashboard header's height plus a little breathing room;
        the `md:pb-8` on `<main>` in the layout is the other half of that budget.

        So: a long day scrolls inside the panel and the card always reaches the
        fold, and a short day's spare room is *inside* a bordered card where it
        reads as "nothing else scheduled" rather than as a broken page.
      */}
      <div className="relative mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-[1500px] flex-col px-4 py-6 sm:px-6 sm:py-8 2xl:max-w-[1760px]">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
          <RoutineHero
            isToday={isToday}
            dayTypeName={activeTab?.label ?? data?.dayTypeName ?? null}
            dayTypeSource={data?.dayTypeSource ?? 'NATURAL'}
            dayTypeColor={activeTab?.color ?? null}
            dayTypeIcon={activeTab?.icon ?? null}
            trackedDone={trackedDone}
            trackedTotal={trackedTotal}
            minutesRemainingToday={minutesRemainingToday}
            freeMinutes={summary.freeMinutes}
            score={data?.score ?? null}
            onEditDayType={() => {
              if (dayTypeDefinition) {
                setDayTypeEditor(dayTypeDefinition);
                setDayTypeEditorOpen(true);
              }
            }}
            onChangeDayType={() => setDayModeOpen(true)}
          />

          <div className="rounded-2xl border border-border bg-card p-4">
            <DateStrip
              date={date}
              today={today}
              onSelect={selectDate}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/*
          The day-type strip.

          Wrapped in a card matching the hero above and the date strip beside it.
          It used to be a bare `flex` row directly on the page background, so the
          three controls at the top of this column had three different left
          edges and three different vertical rhythms — which read as three
          unrelated widgets rather than as one header. Same `rounded-2xl border
          border-border bg-card p-4` as its siblings, same gap-4 between them.
        */}
        <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {dayTypes.isLoading ? (
              <TabsSkeleton count={Math.max(tabs.length, 4)} />
            ) : dayTypes.error ? (
              <p role="alert" className="text-sm text-destructive">
                {dayTypes.error}
              </p>
            ) : tabs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You have no day types yet.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setDayTypeEditor(null);
                    setDayTypeEditorOpen(true);
                  }}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Create one
                </button>{' '}
                to build a schedule.
              </p>
            ) : (
              <DayTypeTabs
                tabs={tabs}
                definitions={dayTypes.active}
                selectedKey={activeTab ? routineTabKey(activeTab) : null}
                onSelect={selectTab}
                onEdit={(definition) => {
                  setDayTypeEditor(definition);
                  setDayTypeEditorOpen(true);
                }}
                panelId="routine-schedule-panel"
                isLoading={false}
              />
            )}
          </div>

          <ApplyToRangeTrigger
            disabled={readOnly || blocks.length === 0 || activeTab === null}
            onClick={() => setApplyRangeOpen(true)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDayTypeEditor(null);
              setDayTypeEditorOpen(true);
            }}
            className="shrink-0"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Day type</span>
          </Button>
        </div>
        </div>

        {!online && <OfflineNotice />}
        {readOnly && (
          <ReadOnlyNotice
            daysAgo={calendarDaysBetween(date, today)}
            windowDays={retroactiveDays}
          />
        )}
        {showRestDay && (
          <RestDayBanner
            reason={data?.score.restDayReason ?? null}
            onChange={() => setDayModeOpen(true)}
            blocksRemaining={blocks.length}
          />
        )}
        {allDone && !showRestDay && <DayCompleteBanner />}
        {viewingOtherDayType && (
          <p role="status" className="text-sm text-muted-foreground">
            Showing <strong className="text-foreground">{activeTab?.label}</strong>. This
            date resolves to <strong className="text-foreground">{data?.dayTypeName ?? 'its natural type'}</strong>.
          </p>
        )}

        {/* Main grid: timeline + rail */}
        {/*
            No `items-start`: both columns stretch to the height of the taller
            one, so the timeline card fills the row instead of ending mid-screen
            and leaving a dead dark band beneath it. The timeline's inner scroll
            area then bounds its own height, which is where the cap belongs.

            The split is fractional, not `3` equal columns with a `col-span-2`.
            `lg:grid-cols-[minmax(0,1fr)_20rem]` gives the timeline every pixel
            the rail does not need, at every width from 1024px upward. The old
            fixed 3-column track forced the rail to be a third of the grid
            regardless of how much room there was, so on a wide monitor the
            timeline got 2/3 of a 1280px column — a narrow strip in a wide
            screen — and on a 4K display it was proportionally no better.

            `minmax(0, 1fr)` rather than `1fr`: a bare `1fr` track has a
            `min-width: auto`, so a wide child (a long title, a wide gap ribbon)
            can push the track past its share and squeeze the rail to nothing.
            This is the standard fix and the reason the timeline cannot overflow.

            `min-h-0` on the grid: it is a flex child of the page column and needs
            to be allowed to shrink, or it takes its content's full height and the
            panel's `flex-1` has nothing to divide.
          */}
          <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
            {/*
              `order-first` below `lg`, not `order-last`.

              The schedule is the reason this page exists and the rail is context
              for it, so on a phone the schedule comes first and the analytics
              follow underneath. The previous `order-last` put five rail cards
              between the date strip and the timeline, which on a 360px screen
              meant scrolling past the whole rail to reach the day's blocks.

              At `lg` both drop to `order-none`, so DOM order governs and the rail
              returns to the right-hand column.
            */}
            {/*
              The schedule column. `min-h-0` so it can shrink inside the grid
              row — the panel below then fills whatever height is left after the
              header, hero, date strip and day-type strip, which is what removes
              the void beneath the card.
            */}
            <section className="order-first flex min-h-0 min-w-0 flex-col lg:order-none">
            {/*
              The tab panel is this element and it is ALWAYS rendered. Each tab
              declares `aria-controls="routine-schedule-panel"`, so in the error,
              empty and no-template states — where `RoutineTimeline` is not
              rendered and its `<ul role="tabpanel">` went with it — the
              controlled element did not exist. A screen reader announcing a tab
              whose panel is missing is a broken control, not a cosmetic issue.
            */}
            <div
              id="routine-schedule-panel"
              role="tabpanel"
              aria-labelledby={
                activeTab
                  ? `routine-tab-${routineTabKey(activeTab).replace(/[^a-zA-Z0-9]/g, '-')}`
                  : undefined
              }
              tabIndex={-1}
              className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 p-4 sm:p-5"
            >
              {error ? (
                <RoutineErrorState message={error} onRetry={() => void refetch()} />
              ) : isLoading && !data ? (
                <RoutineLoadingState />
              ) : !data ? null : !data.template && data.templateIsActive !== false ? (
                <NoTemplateState
                  dayTypeName={activeTab?.label ?? 'This day type'}
                  onSetUp={() => setEditor({ mode: 'create' })}
                />
              ) : visibleBlocks.length === 0 ? (
                viewingOtherDayType ? (
                  /*
                    Three states, not one. The old copy claimed "no blocks are
                    loaded" for a tab that simply had not been fetched yet, which
                    is how a College day with a full template got reported as
                    empty.

                    `previewBlocks === null` is still in flight, so saying
                    anything about emptiness would be a guess. Only once the
                    request has resolved with nothing do we say it is empty.
                  */
                  previewInFlight ? (
                    <div
                      className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
                      aria-busy="true"
                    >
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground/70 motion-reduce:animate-none" />
                      Loading {activeTab?.label}…
                    </div>
                  ) : (
                    <EmptyBlocksState
                      dayTypeName={activeTab?.label ?? 'This day type'}
                      onAdd={() => setEditor({ mode: 'create' })}
                    />
                  )
                ) : (
                  <EmptyBlocksState
                    dayTypeName={activeTab?.label ?? 'This day type'}
                    onAdd={() => setEditor({ mode: 'create' })}
                  />
                )
              ) : (
                <RoutineTimeline
                  blocks={visibleBlocks}
                  nowMinutes={nowMinutes}
                  isToday={isToday}
                  timeFormat24h={timeFormat24h}
                  readOnly={readOnly}
                  busyBlockIds={pendingBlockIds}
                  onToggleDone={(block) => void toggleDone(block)}
                  onStart={(block) => void startBlock(block)}
                  onDetails={setCompletionBlock}
                  onEdit={(block) => setEditor({ mode: 'edit', block })}
                  onDuplicate={(block) => void duplicate(block)}
                  onNudge={(block, delta) => void nudge(block, delta)}
                  onDelete={setPendingDelete}
                  onFillGap={(start, end) => setEditor({ mode: 'create', start, end })}
                />
              )}
            </div>

            {/* Floating add, clear of the mobile nav's safe area. */}
            {!readOnly && (
              <Button
                variant="primary"
                onClick={() => setEditor({ mode: 'create' })}
                aria-label="Add a routine block"
                // Mobile only, so the viewport edge *is* the content edge and it
                // does not detach on a wide screen the way a viewport-pinned
                // control would. The safe-area inset keeps it clear of a home
                // indicator on a notched phone.
                className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full p-0 shadow-floating sm:hidden"
              >
                <Plus size={22} />
              </Button>
            )}
          </section>

          {/*
            The analytics rail.

            Below `lg` it comes *after* the schedule, not before. The old
            comment here argued the opposite — that on a phone the summary is the
            answer and the schedule is the detail — and with six cards in the rail
            that argument put every one of them between the user and their day.
            Reaching the schedule should not require scrolling past the entire
            analytics column. At `lg` the rail returns to the right-hand side,
            where being beside the schedule is what makes it useful.

            `lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto` is what makes
            `sticky` work at all. Sticky pins an element only while it is shorter
            than the space it is pinned in; even with the three comparison cards
            folded this rail can outgrow a laptop viewport, and with `sticky`
            alone it scrolled off with the timeline. Scrolling inside its own
            pinned box keeps every card reachable while the timeline is read.

            `dvh` not `vh`: `vh` is the largest viewport, so on mobile the rail's
            bottom would sit under the browser chrome. `overscroll-contain` stops
            a wheel gesture that ends at the rail's edge from then scrolling the
            page behind it.
          */}
          <aside className="order-last min-w-0 space-y-4 lg:order-none lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            {error || (isLoading && !data) ? (
              <RailSkeleton />
            ) : (
              <>
                <NowNextCard
                  blocks={visibleBlocks.length > 0 ? visibleBlocks : blocks}
                  nowMinutes={nowMinutes}
                  isToday={isToday}
                  timeFormat24h={timeFormat24h}
                  isRestDay={showRestDay}
                  completionRate={completionRate}
                  trackedDone={trackedDone}
                  trackedTotal={trackedTotal}
                  loggedBlocks={loggedBlocks}
scoreRoutineRate={data?.score.routineCompletionRate ?? 0}
          offScheduleLogs={offScheduleLogs}
        />
                <DayShapeBar
                  blocks={sortBlocks(visibleBlocks.length > 0 ? visibleBlocks : blocks)}
                />

                {/*
                  A3.1 / A3.2 — one fetch, two views. The week strip and the
                  per-preset comparison read the same `getRoutineProgress`
                  payload, so they share `useWeekPattern` rather than each
                  issuing the 3-query aggregate.
                */}
                {/*
                  Open by default: what is running and the shape of the day. These
                  answer "where am I", which is why the user came.

                  Folded: everything that compares today to a pattern. Six equally
                  weighted cards made the rail an endless scroll with no hierarchy,
                  and the comparison cards are reference material — consulted on
                  purpose, not scanned past. Each folded heading still carries its
                  own answer, so deciding whether to open it needs no opening.
                */}
                <CollapsibleRailCard
                  title="This week"
                  summary={weekSummary(week.data)}
                >
                  <WeekPattern
                    bare
                    days={weekDays}
                    response={week.data}
                    selectedDate={date}
                    onSelectDate={selectDate}
                  />
                </CollapsibleRailCard>

                <CollapsibleRailCard
                  title="By day type"
                  summary={dayTypeSummary(dayTypeRollups)}
                >
                  <DayTypePerformance
                    bare
                    rollups={dayTypeRollups}
                    isLoading={week.isLoading && week.data === null}
                  />
                </CollapsibleRailCard>

                <CollapsibleRailCard
                  title="Day-type overrides"
                  summary={overridesSummary(overrides.data, today)}
                >
                  <DayOverrides
                    bare
                    overrides={overrides.data}
                    selectedDate={date}
                    today={today}
                    isLoading={overrides.isLoading}
                    onSelectDate={selectDate}
                  />
                </CollapsibleRailCard>

                <CollapsibleRailCard
                  title="What this preset applies to"
                  summary={appliesToSummary(dayTypeDefinition, blocks.length, summary.scheduledMinutes)}
                >
                  <AppliesToCard
                    bare
                    definition={dayTypeDefinition}
                    templateTotalMinutes={summary.scheduledMinutes}
                    blockCount={blocks.length}
                  />
                </CollapsibleRailCard>
              </>
            )}
          </aside>
        </div>

        {/* Desktop add button */}
        {!readOnly && (
          <div className="hidden justify-end sm:flex">
            <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
              <Plus size={15} />
              Add block
            </Button>
          </div>
        )}
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}

      {/*
        `siblings` is the block list of the schedule resolved for *this date*, so
        it needs the same id handed over for the editor to know whether the
        overlap preview is in scope. Passing it explicitly is what stops a
        `Placement` block from being compared against `College`'s blocks.

        The old expression was `editor?.mode === 'edit' ? blocks : blocks` — both
        branches identical, left over from an earlier shape.
      */}
      <BlockEditor
        open={editor !== null}
        mode={editor?.mode ?? 'create'}
        block={editor?.mode === 'edit' ? editor.block : null}
        siblings={blocks}
        siblingsDayTypeId={resolvedDayTypeId}
        dayTypes={dayTypes.active}
        defaultDayTypeId={activeTab?.dayTypeId ?? null}
        defaultDayTypeValue={(activeTab?.value as DayType | undefined) ?? null}
        initialStart={editor?.mode === 'create' ? editor.start : undefined}
        initialEnd={editor?.mode === 'create' ? editor.end : undefined}
        date={date}
        onClose={() => setEditor(null)}
        onSaved={notify}
      />

      <CompletionSheet
        open={completionBlock !== null}
        block={completionBlock}
        date={date}
        onClose={() => setCompletionBlock(null)}
        onSaved={notify}
      />

      <DayTypeEditor
        open={dayTypeEditorOpen}
        definition={dayTypeEditor}
        nextSortOrder={dayTypes.dayTypes.length}
        onClose={() => setDayTypeEditorOpen(false)}
        onSaved={(message) => {
          notify(message);
          void dayTypes.refetch();
        }}
      />

      {/*
        A3.6. Applying a range writes exceptions, so the day's own resolution
        changes — hence the day refetch as well as the overrides list, which is
        the one surface that shows the new rows immediately.
      */}
      <ApplyToRangeDialog
        open={applyRangeOpen}
        onClose={() => setApplyRangeOpen(false)}
        dayTypeName={dayTypeDefinition?.name ?? null}
        dayTypeId={activeTab?.dayTypeId ?? null}
        dayTypeValue={activeTab ? (activeTab.value as DayType) : null}
        today={today}
        blockCount={blocks.length}
        onApplied={() => {
          void refetch();
          void overrides.refetch();
        }}
      />

      <DayModeDialog
        open={dayModeOpen}
        date={date}
        currentDayTypeId={resolvedDayTypeId}
        dayTypes={dayTypes.active}
        onClose={() => setDayModeOpen(false)}
        onSaved={(message) => {
          notify(message);
          setDayModeOpen(false);
          void refetch();
        }}
      />

      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this block?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>
              Delete block
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{pendingDelete?.title}</strong> (
          {pendingDelete?.startTime}–{pendingDelete?.endTime}) will be removed from this day
          type&apos;s schedule. Existing logs for it are kept in your history.
        </p>
      </Modal>

      {/*
        `sonner`'s Toaster is mounted on `/today` only, so without one here a
        tick produced no visible confirmation anywhere on this page.
      */}
      {/*
        `sonner`'s Toaster is mounted on `/today` only, so without one here a
        tick produced no visible confirmation anywhere on this page.

        `offset` and `mobileOffset` rather than a plain `bottom-right`: sonner
        pins its viewport edge, so on a 2560px display the toast lands far to
        the right of the content column and reads as detached from the page it
        belongs to. The offset pulls it back toward the column's edge without
        needing to measure the column in JavaScript.
      */}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        offset="6rem"
        mobileOffset={{ bottom: '6rem', right: '1rem', left: '1rem' }}
        toastOptions={{ className: 'max-w-[calc(100vw-2rem)]' }}
      />
      </div>
    </div>
  );
}

/**
 * Change a date's day type.
 *
 * Reuses `POST /api/day-mode` with the same payload `TodayDayType` sends, rather
 * than a second mechanism: choosing a day type here must produce the same
 * `RoutineException` it produces from `/today`, or the two pages disagree about
 * what day it is.
 */
function DayModeDialog({
  open,
  date,
  currentDayTypeId,
  dayTypes,
  onClose,
  onSaved,
}: {
  open: boolean;
  date: string;
  currentDayTypeId: string | null;
  dayTypes: DayTypeDefinition[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [mode, setMode] = useState<'DAY_TYPE' | 'REST' | 'MINIMUM' | 'CLEAR'>('DAY_TYPE');
  const [dayTypeId, setDayTypeId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('DAY_TYPE');
    setDayTypeId(currentDayTypeId ?? '');
    setReason('');
    setError(null);
  }, [open, currentDayTypeId]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const chosen = dayTypes.find((definition) => definition.id === dayTypeId);

      await apiRequest('/api/day-mode', {
        method: 'POST',
        body: {
          date,
          mode,
          // `DAY_TYPE` needs the enum too: a custom day type stores
          // `dayType: 'CUSTOM'` alongside the id, and `dayModeService` rejects a
          // DAY_TYPE payload with no `dayType`.
          ...(mode === 'DAY_TYPE' && chosen
            ? { dayType: 'CUSTOM' as const, dayTypeId: chosen.id }
            : {}),
          ...(mode === 'REST' && { reason: reason.trim() || 'Rest day' }),
        },
      });

      onSaved(
        mode === 'CLEAR'
          ? 'Back to the natural schedule'
          : mode === 'REST'
            ? 'Marked as a rest day'
            : mode === 'MINIMUM'
              ? 'Set as a minimum day'
              : `Day type set to ${chosen?.name ?? 'selected'}`
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? apiErrorMessage({ error: caught.message }, 'Could not change this day')
          : 'Could not change this day'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Change this day's type"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} isLoading={submitting}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-foreground">What kind of day is this?</legend>
          {(
            [
              { value: 'DAY_TYPE', label: 'Use a day type', hint: 'Swap the whole schedule' },
              { value: 'REST', label: 'Rest day', hint: 'Nothing is expected of you' },
              { value: 'MINIMUM', label: 'Minimum day', hint: 'Only the essentials are scored' },
              { value: 'CLEAR', label: 'Back to natural', hint: 'Remove this override' },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name="day-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {mode === 'DAY_TYPE' && (
          <select
            value={dayTypeId}
            onChange={(event) => setDayTypeId(event.target.value)}
            aria-label="Day type"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choose a day type…</option>
            {dayTypes.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>
        )}

        {mode === 'REST' && (
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-label="Reason (optional)"
            placeholder="Reason (optional)"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}