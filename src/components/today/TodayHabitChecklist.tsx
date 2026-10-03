'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarPlus,
  Check,
  ListChecks,
  Pencil,
  Plus,
  Search,
  SkipForward,
  X,
} from 'lucide-react';

import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover';
import AddHabitModal from '@/components/habits/AddHabitModal';
import { runAchievementCheck } from '@/store/achievement.store';
// `showNotification` is the Web Notifications wrapper in `lib/pwa/notifications`
// — it is not part of the achievement store, which only owns the celebration
// queue. `TodaySleep.tsx` already imports it from this module.
import { showNotification } from '@/lib/pwa/notifications';
import { notifyTodayDataChanged, onTodayDataChanged } from '@/lib/today-sync';
import { submitOrQueue } from '@/lib/offline/outbox';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import type { HabitTier, HabitLogStatus } from '@/generated/prisma';
import { HABIT_TIER_CONFIG, HABIT_TIERS_ORDERED } from '@/constants/habit-tiers';
import { GlassPanel } from '@/components/today/ui';
import { actionToast, errorToast, useCelebration } from '@/components/today/celebration';

interface TodayHabit {
  id: string;
  name: string;
  tier: HabitTier;
  color: string | null;
  icon: string | null;
  estimatedDuration: number | null;
  source?: 'SCHEDULED' | 'MANUAL';
  log: {
    id: string;
    status: HabitLogStatus;
  } | null;
}

interface AllHabit {
  id: string;
  name: string;
  tier: HabitTier;
  icon: string | null;
}

interface TodayHabitChecklistProps {
  date: string;
}

/** This card's identity in the `/today` broadcast, so it can skip its own writes. */
const HABIT_SYNC_SOURCE = 'TodayHabitChecklist';

/**
 * 2.4 - the live completion bar.
 *
 * Animates with a CSS width transition rather than framer-motion so it costs
 * nothing, and renders nothing when there are no habits rather than showing a
 * misleading 0%.
 */
function HabitProgressBar({ habits }: { habits: TodayHabit[] }) {
  const total = habits.length;
  const done = habits.filter((h) => h.log?.status === 'COMPLETED').length;
  if (total === 0) return null;

  const pct = Math.round((done / total) * 100);
  const complete = done === total;

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tabular-nums text-foreground">
          {done}/{total}
        </span>
        <span
          className={cn(
            'text-xs font-medium tabular-nums',
            complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          )}
        >
          {pct}%
          {complete && ' - all done'}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Habits completed today"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
            complete ? 'bg-emerald-500' : 'bg-primary'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function TodayHabitChecklist({ date }: TodayHabitChecklistProps) {
  const reduce = useReducedMotion();
  /** 2.5 — confetti + milestone toasts, both gated on the animation setting. */
  const celebrate = useCelebration();
  const [habits, setHabits] = useState<TodayHabit[]>([]);
  const [allHabits, setAllHabits] = useState<AllHabit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  /**
   * Fetch today's habits.
   *
   * `background` distinguishes the **first** load from every later refetch.
   *
   * This previously always set `loading = true`, and it is called after every
   * interaction — toggle, undo, skip, add, remove, rename. Because the render
   * does `if (loading) return <skeleton>`, each of those destroyed and rebuilt
   * the whole card: heading, progress bar, both action buttons, every row, and
   * the confetti that had just fired. The optimistic update was visible for
   * roughly zero milliseconds, and the skeleton was a different height from the
   * real panel, so the grid resized on every click.
   *
   * Now only the first load shows the skeleton; a background refetch swaps the
   * data in place.
   */
  const fetchTodayHabits = useCallback(
    async (options: { background?: boolean } = {}) => {
      if (!options.background) setLoading(true);
      try {
        setError(null);
        const res = await fetch(`/api/habits/today?date=${date}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load today's habits");
        if (data.success) {
          setHabits(data.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load today's habits");
      } finally {
        if (!options.background) setLoading(false);
      }
    },
    [date]
  );

  const fetchAllHabits = useCallback(async () => {
    try {
      const res = await fetch('/api/habits?status=ACTIVE&limit=100');
      const data = await res.json();
      if (res.ok && data.success) {
        setAllHabits(data.data);
      }
    } catch {
      // Non-fatal; picker just shows an empty list.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    fetchTodayHabits();
  }, [fetchTodayHabits]);

  /**
   * Writes made elsewhere on the page — the command palette's "Habits" group,
   * and (indirectly) the sleep flow, whose completion also changes the score.
   * Without this the card kept its own snapshot and a habit could read as done
   * in the palette and not done here until a hard reload.
   */
  useEffect(
    () =>
      onTodayDataChanged(
        () => void fetchTodayHabits({ background: true }),
        HABIT_SYNC_SOURCE
      ),
    [fetchTodayHabits]
  );

  async function toggleHabit(
    habitId: string,
    currentStatus: HabitLogStatus | null,
    anchor?: { x: number; y: number }
  ) {
    if (togglingId) return;
    const newStatus: HabitLogStatus = currentStatus === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
    setTogglingId(habitId);
    setError(null);
    // Optimistic update with rollback on failure.
    const previous = habits;
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habitId ? { ...h, log: { id: h.log?.id ?? `local-${habitId}`, status: newStatus } } : h
      )
    );

    /**
     * 2.5 — celebrations.
     *
     * Computed against the *optimistic* list, so the burst fires on the same
     * tick as the check rather than waiting for the refetch. If the request then
     * fails the state rolls back, but the confetti has already gone; that is an
     * acceptable trade for instant feedback, and the error banner still reports
     * the failure honestly.
     */
    const projected = previous.map((h) =>
      h.id === habitId ? { ...h, log: { id: h.log?.id ?? `local-${habitId}`, status: newStatus } } : h
    );

    /**
     * Resolved before the `try` because it is used by both the system
     * notification below and the undo toast. It was previously declared *after*
     * both, so every completed habit hit
     * `ReferenceError: Cannot access 'name' before initialization` on the first
     * reference — a temporal dead zone crash that aborted the rest of the
     * handler, including the undo toast. A build error was masking it.
     */
    const name = previous.find((h) => h.id === habitId)?.name ?? 'Habit';

    try {
      /**
       * `submitOrQueue` rather than `fetch`, so a tick made with no connection
       * is not thrown away.
       *
       * The optimistic state was already applied above, so the checkbox is
       * visually correct either way. Previously the offline path threw
       * "Failed to save habit log", rolled the tick back, and lost the user's
       * input entirely. Now the write is queued and replayed on reconnect.
       */
      const result = await submitOrQueue({
        url: `/api/habits/${habitId}/log`,
        body: {
          date,
          status: newStatus,
          completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null,
        },
        label: `${name} — ${newStatus.toLowerCase()}`,
      });

      if (result.queued) {
        /**
         * Undo still works offline. `flushOutbox` replays oldest-first and stops
         * on failure, so a queued tick followed by a queued undo lands as
         * COMPLETED then MISSED — the correct end state, not a double-count.
         */
        actionToast(
          `${name} saved offline — will sync when you reconnect`,
          async () => {
            const back: HabitLogStatus = newStatus === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
            await submitOrQueue({
              url: `/api/habits/${habitId}/log`,
              body: {
                date,
                status: back,
                completedAt: back === 'COMPLETED' ? new Date().toISOString() : null,
              },
              label: `undo ${name}`,
            });
            setHabits((prev) =>
              prev.map((h) =>
                h.id === habitId
                  ? { ...h, log: { id: h.log?.id ?? `local-${habitId}`, status: back } }
                  : h
              )
            );
          },
          { description: 'Nothing is lost — it syncs when you reconnect' }
        );
        return;
      }
      if (!result.delivered) throw new Error('Failed to save habit log');
      if (newStatus === 'COMPLETED') void runAchievementCheck();

      // 2.9 — system notification for habit completion.
      //
      // Fire-and-forget: `showNotification` resolves `false` (no-ops) when the
      // Notification API is unsupported, permission is denied, or the user has
      // not granted it, so there is nothing to branch on here.
      //
      // The `tag` is scoped per habit. It used to be the constant
      // `'habit-completed'`, which made the browser treat every habit
      // completion as the *same* notification: ticking a second habit replaced
      // the first habit's notification instead of stacking, and the
      // "one notification per habit" intent in the comment was not what the
      // code did.
      if (newStatus === 'COMPLETED') {
        void showNotification(`${name} completed today`, {
          body: 'Great job keeping your habit streak!',
          tag: `habit-completed-${habitId}`,
          vibrate: [200, 100, 200],
        });
      }

      // 2.8 — toast with Undo. The undo re-posts the opposite status rather
      // than only mutating local state, so the server agrees with the screen.
      actionToast(
        newStatus === 'COMPLETED' ? `${name} done` : `${name} marked not done`,
        async () => {
          const back: HabitLogStatus = newStatus === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
          const undoRes = await fetch(`/api/habits/${habitId}/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date,
              status: back,
              completedAt: back === 'COMPLETED' ? new Date().toISOString() : null,
            }),
          });
          if (!undoRes.ok) {
            errorToast('Could not undo that change');
            return;
          }
          setHabits((prev) =>
            prev.map((h) =>
              h.id === habitId
                ? { ...h, log: { id: h.log?.id ?? `local-${habitId}`, status: back } }
                : h
            )
          );
          void fetchTodayHabits({ background: true });
          notifyTodayDataChanged(HABIT_SYNC_SOURCE);
        }
      );

      if (newStatus === 'COMPLETED') {
        if (allNonNegotiablesComplete(projected)) {
          celebrate.allNonNegotiablesDone();
        } else {
          celebrate.habitDone(anchor);
        }
      }

      // Reconcile with server truth (score + streak update downstream).
      void fetchTodayHabits({ background: true });
      // The score and streak cards read the aggregates this write changed.
      notifyTodayDataChanged(HABIT_SYNC_SOURCE);
    } catch (err) {
      setHabits(previous);
      const message = err instanceof Error ? err.message : 'Failed to save habit log';
      setError(message);
      errorToast(message);
    } finally {
      setTogglingId(null);
    }
  }

  /** True when every NON_NEGOTIABLE habit in the list is COMPLETED. */
  function allNonNegotiablesComplete(list: TodayHabit[]): boolean {
    const nonNegotiables = list.filter((h) => h.tier === 'NON_NEGOTIABLE');
    if (nonNegotiables.length === 0) return false;
    return nonNegotiables.every((h) => h.log?.status === 'COMPLETED');
  }

  async function skipHabit(habitId: string) {
    setTogglingId(habitId);
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habitId}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reason: 'Skipped from today' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to skip habit');
      await fetchTodayHabits({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip habit');
    } finally {
      setTogglingId(null);
    }
  }

  async function removeFromToday(habitId: string) {
    setTogglingId(habitId);
    setError(null);
    try {
      const res = await fetch('/api/habits/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, action: 'REMOVE', habitId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to remove habit');
      await fetchTodayHabits({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove habit');
    } finally {
      setTogglingId(null);
    }
  }

  async function addToToday(habitId: string) {
    setAddingId(habitId);
    setError(null);
    try {
      const res = await fetch('/api/habits/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, action: 'ADD', habitId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to add habit');
      await fetchTodayHabits({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add habit');
    } finally {
      setAddingId(null);
    }
  }

  async function saveRename(habitId: string) {
    const name = draftName.trim();
    if (!name || name === habits.find(h => h.id === habitId)?.name) {
      setEditingId(null);
      setDraftName('');
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to rename habit');
      await fetchTodayHabits({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename habit');
    } finally {
      setEditingId(null);
      setDraftName('');
    }
  }

  function startRename(habit: TodayHabit) {
    setEditingId(habit.id);
    setDraftName(habit.name);
  }

  // Habits the user can add to today: active habits not already in the list.
  const addableHabits = useMemo(() => {
    const inToday = new Set(habits.map(h => h.id));
    const query = search.trim().toLowerCase();
    return allHabits
      .filter(h => !inToday.has(h.id))
      .filter(h => !query || h.name.toLowerCase().includes(query));
  }, [allHabits, habits, search]);

  // Group by tier (fixed ordering via HABIT_TIERS_ORDERED so non-central tiers render too).
  const habitsByTier = useMemo(() => {
    const acc: Record<string, TodayHabit[]> = {};
    for (const habit of habits) {
      const bucket = acc[habit.tier] ?? (acc[habit.tier] = []);
      bucket.push(habit);
    }
    return acc;
  }, [habits]);

  if (loading) {
    return (
      <GlassPanel
        accent="habits"
        className="min-h-[18rem] p-4 sm:p-5"
        aria-busy="true"
        aria-label="Loading today's habits"
      >
        <div className="mb-6 flex items-center justify-between">
          <Skeleton shine className="h-6 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </GlassPanel>
    );
  }

  return (
      <GlassPanel accent="habits" className="h-full p-4 sm:p-5">
      {/* 2.4 — live "N/M · P%" bar pinned to the top of the card.
          Derived from the same list the rows render, so it moves the instant a
          habit is checked rather than after the refetch. */}
      <HabitProgressBar habits={habits} />

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Today&apos;s Habits</h2>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add to Today
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-3">
              <div className="mb-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search habits…"
                  icon={<Search className="h-4 w-4" aria-hidden="true" />}
                  aria-label="Search habits to add"
                />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {addableHabits.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {habits.length === 0 && !search
                      ? 'No other active habits to add.'
                      : 'No habits match your search.'}
                  </p>
                )}
                {addableHabits.map((habit) => (
                  <button
                    key={habit.id}
                    type="button"
                    disabled={addingId === habit.id}
                    onClick={() => addToToday(habit.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted/70 disabled:opacity-60"
                  >
                    <span aria-hidden="true">{habit.icon ?? '🌱'}</span>
                    <span className="flex-1 truncate">{habit.name}</span>
                    <Badge variant="default">
                      {HABIT_TIER_CONFIG[habit.tier].label}
                    </Badge>
                    <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
            + New Habit
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive mb-4">{error}</p>
      )}

      {/*
        `min-h-0` + `overflow-y-auto` is required, not cosmetic.

        The panel now genuinely fills its `row-span-2` cell (see the `h-full` on
        the Stagger in `today/page.tsx`). `GlassPanel` is `overflow-hidden` and its
        content div is `flex min-h-0 flex-1 flex-col`, so without this the list
        would be silently clipped with no scrollbar and the last habits
        unreachable. `min-h-0` is what lets a flex child shrink below its content
        height, which is what makes the scroll possible.
      */}
      {/*
        Grows with the list up to ~5 habits, then scrolls.

        There is deliberately **no `min-h`**: with two habits the card is short,
        and because the grid no longer pins rows, everything below it moves up
        rather than leaving an empty band.

        The `max-h` is the cap that makes the layout stable. Past it `overflow-y-auto`
        engages and the card stops getting taller — so once a user has more than
        about five habits, Active Goals below stops moving down as they add more.
        Without the cap the card would grow without bound and the page would
        reflow on every tick.

        `max-h-[17rem]` is sized for roughly five rows (5 x ~44px plus tier
        headers and gaps); it is a maximum, not a target, so a short list renders
        short.
      */}
      <div className="min-h-0 max-h-[17rem] space-y-3 overflow-y-auto pr-1">
        {HABIT_TIERS_ORDERED.map(tier => {
          const tierHabits = habitsByTier[tier] || [];
          if (tierHabits.length === 0) return null;

          const tierConfig = HABIT_TIER_CONFIG[tier];
          const completedCount = tierHabits.filter(
            h => h.log?.status === 'COMPLETED'
          ).length;

          return (
            <div key={tier}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span>{tierConfig.icon}</span>
                  <h3 className="font-semibold">{tierConfig.label}</h3>
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {completedCount}/{tierHabits.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {tierHabits.map(habit => {
                  const done = habit.log?.status === 'COMPLETED';
                  const isManual = habit.source === 'MANUAL';
                  const isEditing = editingId === habit.id;
                  return (
                    <motion.div
                      key={habit.id}
                      layout={reduce ? false : true}
                      transition={reduce ? undefined : { layout: { duration: 0.4, ease: EASE } }}
                      className="group flex items-center gap-3 p-3 rounded-lg hover:bg-muted/60 transition-colors"
                    >
                      <motion.div
                        key={done ? 'done' : 'open'}
                        initial={reduce ? false : { scale: done ? 0.6 : 1 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                        className="shrink-0"
                      >
                        <Checkbox
                          checked={done}
                          disabled={togglingId === habit.id}
                          onCheckedChange={() =>
                            toggleHabit(habit.id, habit.log?.status || null)
                          }
                          aria-label={`Mark ${habit.name} ${done ? 'not done' : 'done'}`}
                        />
                      </motion.div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {habit.icon && <span aria-hidden="true">{habit.icon}</span>}
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRename(habit.id);
                                if (e.key === 'Escape') {
                                  setEditingId(null);
                                  setDraftName('');
                                }
                              }}
                              className="h-7 py-1 text-sm"
                              aria-label="Habit name"
                            />
                          ) : (
                            <span className="relative inline-block">
                              {/*
                                2.4 - strike-through WIPE.

                                `line-through` alone snaps the rule on and off with
                                no transition, because the `text-decoration` is not
                                an animatable property. The line is therefore a real
                                element scaled from `scaleX(0)` on the left edge, so
                                it draws itself across the label as the habit is
                                completed. `origin-left` is what makes it wipe
                                rightwards rather than out from the centre.
                              */}
                              <span
                                className={cn(
                                  'transition-colors duration-300',
                                  done ? 'text-muted-foreground' : 'text-foreground'
                                )}
                              >
                                {habit.name}
                              </span>
                              <motion.span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current"
                                initial={false}
                                animate={{ scaleX: done ? 1 : 0 }}
                                transition={
                                  reduce
                                    ? { duration: 0 }
                                    : { type: 'spring', stiffness: 420, damping: 32 }
                                }
                                style={{ originX: 0, transformOrigin: 'left center' }}
                              />
                            </span>
                          )}
                          {isManual && (
                            <Badge variant="warning" className="shrink-0">
                              added today
                            </Badge>
                          )}
                        </div>
                        {habit.estimatedDuration && !isEditing && (
                          <span className="text-xs text-muted-foreground">
                            {habit.estimatedDuration} min
                          </span>
                        )}
                      </div>

                      {/*
                          Always visible below `sm`, hover-revealed from `sm` up.

                          `opacity-0 group-hover:opacity-100` alone left the row
                          actions completely unreachable on a phone: there is no
                          hover, so rename / skip / remove never appeared and
                          could not be focused either. `focus-within` covers
                          keyboard users on desktop, but not touch.
                        */}
                        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              className="px-2"
                              variant="ghost"
                              onClick={() => saveRename(habit.id)}
                              aria-label={`Save ${habit.name}`}
                            >
                              <Check className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              className="px-2"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null);
                                setDraftName('');
                              }}
                              aria-label="Cancel rename"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              className="px-2"
                              variant="ghost"
                              onClick={() => startRename(habit)}
                              aria-label={`Rename ${habit.name}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              className="px-2"
                              variant="ghost"
                              disabled={togglingId === habit.id || done}
                              onClick={() => skipHabit(habit.id)}
                              aria-label={`Skip ${habit.name} today`}
                            >
                              <SkipForward className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            {isManual && (
                              <Button
                                size="sm"
                                className="px-2"
                                variant="ghost"
                                disabled={togglingId === habit.id}
                                onClick={() => removeFromToday(habit.id)}
                                aria-label={`Remove ${habit.name} from today`}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {habits.length === 0 && (
        <EmptyState
          icon={<ListChecks className="mx-auto h-10 w-10 text-muted-foreground/50" />}
          title="No habits scheduled for today"
          description="Use “Add to Today” above, or create a new habit."
          action={<Button variant="outline" onClick={() => setModalOpen(true)}>New Habit</Button>}
        />
      )}

      <AddHabitModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          void fetchTodayHabits({ background: true });
          fetchAllHabits();
        }}
      />
    </GlassPanel>
  );
}