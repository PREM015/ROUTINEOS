'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus, Target, TriangleAlert, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from 'sonner';
import { useApp } from '@/context/AppContext';
import { runAchievementCheck } from '@/store/achievement.store';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { useGoalsViewData } from '@/hooks/useGoalsViewData';
import { apiRequest } from '@/lib/api-client';
import { Button, EmptyState } from '@/components/ui';
import { GoalCard, type GoalCardView } from '@/components/goals/GoalCard';
import { GoalDrawer } from '@/components/goals/GoalDrawer';
import { GoalFormModal } from '@/components/goals/GoalFormModal';
import { DeleteGoalDialog } from '@/components/goals/DeleteGoalDialog';
import { GoalCardSkeleton } from '@/components/goals/GoalCardSkeleton';
import type { Goal } from '@/context/AppContext';
import { notifyGoalsDataChanged } from '@/lib/app-events';

/**
 * ## `/goals` — "Trajectory"
 *
 * Dashboard glances. Habits tends. Routine clocks. Goals **projects forward**:
 * every number this page's backend now computes is about where you are headed,
 * not only where you are. The identity is a flight path, not a progress bar.
 *
 * ### What changed from the previous page
 *
 * The old page read `goals` from `AppContext` and rendered a 3-column card grid
 * with a private inline `GoalCard`, a range slider, and no notion of pace. It
 * also ignored `dataLoaded` and `dataError`, so a failed load rendered "No daily
 * goals" — identical to an empty account.
 *
 * This one:
 *
 * - leads with **pace state**, not a bare percentage (see `PaceTrack`);
 * - partitions Daily / Long-term / Completed, and promotes **behind-pace** goals
 *   into their own rail instead of hiding the fact in a number;
 * - has **honest states**: loading, error, empty and no-results are four
 *   different screens, not one;
 * - opens a **drawer** for detail, which is also the destination for the
 *   `/goals?goal=<id>` deep link that two systems used to point at a 404.
 */

type Tab = 'DAILY' | 'LONG_TERM' | 'COMPLETED';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'LONG_TERM', label: 'Long-term' },
  { value: 'COMPLETED', label: 'Completed' },
];

export default function GoalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduced = useReducedMotion();
  const {
    goals,
    dataLoaded,
    dataError,
    reloadData,
    addGoal,
    updateGoal,
    updateGoalProgress,
  } = useApp();
  const { today } = useUserTimezone();

  const view = useGoalsViewData(goals);

  const [tab, setTab] = useState<Tab>('DAILY');
  const [query, setQuery] = useState('');
  const [behindOnly, setBehindOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * The deep link. `/goals?goal=<id>` is what the notification and email
   * services now build — both used to emit `/goals/<id>`, and there is no
   * `/goals/[id]` route, so every goal-deadline notification 404'd.
   *
   * The param is removed once applied so closing the drawer leaves a clean URL
   * and the Back button does not reopen a goal the user just dismissed.
   */
  const deepLinkId = searchParams.get('goal');
  const [closedDrawerId, setClosedDrawerId] = useState<string | null>(null);

  /*
    The drawer id is DERIVED, not synced.

    This was `useEffect(() => setDrawerId(deepLinkId))` — prop-shaped state copied
    into state, which renders twice on every deep link and, worse, could never
    represent "the URL asks for goal X but the user dismissed it". Tracking the
    dismissed id instead gives that state room to exist, so the derived value is
    honest:

      - no `?goal=`          → no drawer
      - `?goal=X`, not closed → drawer on X
      - `?goal=X`, closed     → no drawer, and closing is sticky across a
                               re-render while the URL is still being cleaned up

    `deepLinkId` wins over `closedDrawerId` when they disagree about a *different*
    goal, which is the case a notification link actually produces.
  */
  const drawerId = deepLinkId && deepLinkId !== closedDrawerId ? deepLinkId : null;

  /*
    Landing on the tab that actually contains the goal.

    A targeted disable, and the rule is a heuristic that does not fit this case:
    it fires once per deep-link NAVIGATION, not once per render, because
    `deepLinkId` only changes when the user follows a deadline link. That is a
    route change driving the UI — an effect's actual job.

    The alternative, React's "adjust state when a prop changes" render-time
    pattern, would run before the goal list has loaded, so the tab could not be
    computed at all on a cold deep link: the effect is what makes it correct when
    `goals` arrives a tick later.
  */
  useEffect(() => {
    if (!deepLinkId) return;
    const target = goals.find((g) => g.id === deepLinkId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route change drives the tab
    if (target) setTab(tabFor(target));
  }, [deepLinkId, goals]);

  const clearDeepLink = useCallback(() => {
    setClosedDrawerId(deepLinkId);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('goal');
    const next = params.toString();
    router.replace(next ? `/goals?${next}` : '/goals', { scroll: false });
  }, [router, searchParams, deepLinkId]);

  /* ── Partitioning ────────────────────────────────────────────────────── */

  const partitioned = useMemo(() => {
    const finished = (g: Goal) =>
      g.status === 'COMPLETED' || g.status === 'CANCELLED' || g.status === 'CARRIED_OVER';

    return {
      DAILY: goals.filter((g) => g.type === 'DAILY' && !finished(g)),
      LONG_TERM: goals.filter((g) => g.type !== 'DAILY' && !finished(g)),
      COMPLETED: goals.filter(finished),
    } satisfies Record<Tab, Goal[]>;
  }, [goals]);

  const matchesQuery = useCallback(
    (goal: Goal) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        goal.title.toLowerCase().includes(q) ||
        (goal.description ?? '').toLowerCase().includes(q) ||
        (goal.project?.name ?? '').toLowerCase().includes(q)
      );
    },
    [query]
  );

  const listFor = useCallback(
    (which: Tab) => partitioned[which].filter(matchesQuery),
    [partitioned, matchesQuery]
  );

  /**
   * The "needs attention" rail.
   *
* Behind-pace goals are **promoted**, not separated: they are the same cards in
 * the same material, drawn from the same list, just first. The previous page
 * made the user eyeball percentages against dates to notice the same fact —
 * which is the one computation this page exists to perform for them.
 *
 * The card no longer needs a `promoted` flag: a behind goal already renders
 * amber, because the whole card is tinted by pace. The rail only reorders.
   *
   * Daily goals are excluded. A daily goal's pace is measured against its whole
   * window, and "1 of 1 today" is a question the consistency strip answers, not
   * the rail.
   */
  const behind = useMemo(
    () =>
      listFor('LONG_TERM')
        .map((goal) => ({ goal, pace: view.paceFor(goal.id) }))
        .filter(
          (entry): entry is { goal: Goal; pace: NonNullable<ReturnType<typeof view.paceFor>> } =>
            entry.pace !== null && (entry.pace.state === 'behind' || entry.pace.state === 'overdue')
        ),
    [listFor, view]
  );

  const behindIds = useMemo(() => new Set(behind.map((b) => b.goal.id)), [behind]);

  const visible = useMemo(() => {
    const base = listFor(tab);
    if (!behindOnly) return base;
    return base.filter((goal) => behindIds.has(goal.id));
  }, [listFor, tab, behindOnly, behindIds]);

  const isFiltering = query.trim().length > 0 || behindOnly;

  /* ── Summary line ────────────────────────────────────────────────────── */

  const summary = useMemo(() => {
    const daily = partitioned.DAILY;
    const doneToday = daily.filter((g) => view.doneToday(g.id)).length;
    const longTerm = partitioned.LONG_TERM;
    const states = longTerm
      .map((g) => view.paceFor(g.id)?.state)
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    return {
      doneToday,
      dailyTotal: daily.length,
      behind: states.filter((s) => s === 'behind' || s === 'overdue').length,
      ahead: states.filter((s) => s === 'ahead').length,
      inFlight: longTerm.length,
    };
  }, [partitioned, view]);

  /* ── Writes ──────────────────────────────────────────────────────────── */

  const goalTitle = useCallback(
    (id: string) => goals.find((g) => g.id === id)?.title ?? 'Goal',
    [goals]
  );

  /**
   * Daily check-in.
   *
   * There is no second `PATCH` after this any more. The old handler issued one to
   * re-send `currentValue` and `status`, because `checkInDaily` used to write a
   * `COMPLETED` status the page then had to reconcile — two writes and two full
   * relation reads per click, to undo damage the server was doing. The server no
   * longer does that, so the second write is gone.
   */
  const toggleCheckIn = useCallback(
    async (goalId: string, next: boolean) => {
      setBusyId(goalId);
      setActionError(null);
      try {
        await apiRequest(`/api/goals/${goalId}/checkin`, {
          method: 'POST',
          body: { date: today, completed: next },
        });
        view.refreshLog();
        notifyGoalsDataChanged();
        if (next) void runAchievementCheck();
        toast.success(next ? 'Checked in' : 'Check-in undone', {
          description: goalTitle(goalId),
          action: {
            label: 'Undo',
            onClick: () => {
              void apiRequest(`/api/goals/${goalId}/checkin`, {
                method: 'POST',
                body: { date: today, completed: !next },
              })
                .then(() => {
                  view.refreshLog();
                  notifyGoalsDataChanged();
                  toast('Reverted');
                })
                .catch(() => toast.error('Could not undo that'));
            },
          },
        });
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Could not save that check-in'
        );
        toast.error('Could not save that check-in');
      } finally {
        setBusyId(null);
      }
    },
    [today, view, goalTitle]
  );

  const logProgress = useCallback(
    async (goal: Goal, value: number, note: string | null) => {
      // Routed through context, not a bare fetch, so the optimistic write and the
      // server's reconciled row land in the one place every other goal widget
      // reads. A direct `apiRequest` here would update the card and leave the
      // dashboard stale until the next full reload.
      await updateGoalProgress(goal.id, value, note ?? undefined);
      view.refreshLog();
      notifyGoalsDataChanged();
      if (value >= goal.targetValue) void runAchievementCheck();
    },
    [updateGoalProgress, view]
  );

  /* ── Render ──────────────────────────────────────────────────────────── */

  const openDrawer = (id: string) => {
    // Clear any previous dismissal, then drive the drawer from the URL. The param
    // IS the source of truth now, so this is just "forget the closed one".
    setClosedDrawerId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('goal', id);
    router.replace(`/goals?${params.toString()}`, { scroll: false });
  };

  const showLoading = !dataLoaded;
  const showError = Boolean(dataError) && goals.length === 0;

  return (
    <div className="container relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/*
        The horizon.

        Previously a 4% wash across the top 64px, which was not a backdrop so
        much as a header tint — and it left the pace-tinted cards below it
        floating on nothing, which is the condition under which frosted and
        tinted surfaces always read as grey plastic.

        `.goals-horizon` is static by design. An animated full-viewport gradient
        behind a list the user is trying to read forces a continuous repaint of
        the whole page for no informational gain, and the motion brief for this
        page forbids ambient drift anyway.
      */}
      <div aria-hidden="true" className="goals-horizon" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Goals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{fleetSummary(summary)}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search goals"
              aria-label="Search goals by title, description or project"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:w-56"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => setBehindOnly((v) => !v)}
            aria-pressed={behindOnly}
            className={behindOnly ? 'border-pace-behind text-pace-behind' : ''}
          >
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Behind</span>
            {summary.behind > 0 && (
              <span className="font-display tabular-nums">{summary.behind}</span>
            )}
          </Button>

          <Button variant="primary" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add goal</span>
          </Button>
        </div>
      </header>

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {actionError}
        </p>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Goal views"
        className="mb-6 flex w-fit gap-1 rounded-xl border border-border bg-card p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            id={`tab-${t.value}`}
            aria-selected={tab === t.value}
            aria-controls={`panel-${t.value}`}
            tabIndex={tab === t.value ? 0 : -1}
            onClick={() => setTab(t.value)}
            onKeyDown={(event) => {
              // Roving tabindex: the arrow keys move between tabs, which is the
              // ARIA tabs pattern. The old strip had `role="tablist"` and
              // `role="tab"` with no `tabpanel`, no `aria-controls` and no key
              // handling — so screen readers were told about tabs controlling
              // nothing, and a keyboard user could not switch views at all.
              const index = TABS.findIndex((x) => x.value === tab);
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const delta = event.key === 'ArrowRight' ? 1 : -1;
                const nextIndex = (index + delta + TABS.length) % TABS.length;
                const next = TABS[nextIndex];
                if (next) {
                  setTab(next.value);
                  document.getElementById(`tab-${next.value}`)?.focus();
                }
              }
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              tab === t.value
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={-1}
      >
        {/*
          Cross-fade only. No layout animation on a tab switch: the panel swaps
          its children and the browser does the rest, which is both faster and
          calmer than animating fifteen cards in and out on every click.
        */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          >
            {showLoading ? (
              <SkeletonGrid />
            ) : showError ? (
              <ErrorPanel message={dataError ?? 'Something went wrong'} onRetry={reloadData} />
            ) : visible.length === 0 ? (
              <EmptyPanel
                tab={tab}
                isFiltering={isFiltering}
                onClearFilters={() => {
                  setQuery('');
                  setBehindOnly(false);
                }}
                onAdd={() => setFormOpen(true)}
              />
            ) : (
              <>
                {/* The needs-attention rail, long-term view only. */}
                {tab === 'LONG_TERM' && behind.length > 0 && !behindOnly && (
                  <section aria-labelledby="rail-behind" className="mb-6">
                    <h2
                      id="rail-behind"
                      className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-pace-behind"
                    >
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Needs attention · {behind.length}
                    </h2>
                    <motion.div layout={!reduced} className="grid gap-3 sm:grid-cols-2">
                      {behind.map(({ goal, pace }) => (
                        <GoalCard
                          key={goal.id}
                          goal={toCardView(goal)}
                          pace={pace}
                          consistency={view.consistencyFor(goal.id)!}
                          goalShape={view.shapeFor(goal.id)}
                          today={today}
                          isDaily={false}
                          onOpen={openDrawer}
                        />
                      ))}
                    </motion.div>
                  </section>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <AnimatePresence mode="popLayout">
                    {visible
                      .filter((goal) => !behindIds.has(goal.id) || tab !== 'LONG_TERM' || behindOnly)
                      .map((goal) => (
                        <GoalCardViewRenderer
                          key={goal.id}
                          goal={goal}
                          today={today}
                          loadingLog={view.loadingLog}
                          doneToday={view.doneToday(goal.id)}
                          busy={busyId === goal.id}
                          onToggleCheckIn={toggleCheckIn}
                          onOpen={openDrawer}
                          paceFor={view.paceFor}
                          consistencyFor={view.consistencyFor}
                          shapeFor={view.shapeFor}
                        />
                      ))}
                  </AnimatePresence>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Overlays ────────────────────────────────────────────────────── */}
      <GoalFormModal
        open={formOpen || editing !== null}
        goal={editing}
        defaultType={tab === 'DAILY' ? 'DAILY' : 'WEEKLY'}
        today={today}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={async (values) => {
          if (editing) {
            await updateGoal(editing.id, values as any);
            toast.success('Goal updated');
            return;
          }
          await addGoal({
            title: values.title,
            description: values.description,
            type: values.type,
            priority: values.priority,
            targetValue: values.targetValue,
            currentValue: values.currentValue,
            unit: values.unit,
            startDate: values.startDate,
            endDate: values.endDate,
          });
          toast.success('Goal created');
        }}
      />

      <GoalDrawer
        open={drawerId !== null}
        goal={goals.find((g) => g.id === drawerId) ?? null}
        pace={drawerId ? view.paceFor(drawerId) : null}
        consistency={drawerId ? view.consistencyFor(drawerId) : null}
        points={drawerId ? view.pointsFor(drawerId) : []}
        today={today}
        onClose={clearDeepLink}
        onEdit={(goal) => {
          setEditing(goal);
          clearDeepLink();
        }}
        onArchive={async (goal) => {
          await apiRequest(`/api/goals/${goal.id}`, {
            method: 'PUT',
            body: { status: 'CANCELLED' },
          });
          await reloadData();
          toast.success('Goal archived', {
            description: 'Its progress history is kept.',
          });
          clearDeepLink();
        }}
        onDelete={(goal) => {
          clearDeepLink();
          setDeleteTarget(goal);
        }}
        onLogProgress={logProgress}
        // Milestone ticks change `milestoneDoneCount`, which the list carries and
        // the drawer heading shows. `MilestonesPanel` already updated its own
        // rows optimistically; this refetches so the cards behind the drawer
        // agree with it once the drawer closes.
        onChanged={reloadData}
        onCarryOver={async (newGoalId) => {
          // Navigate to the new goal rather than closing. The user just said
          // "yes, give me another period" - landing on the goal that now exists
          // is the confirmation, and it opens on its own milestones so the copied
          // plan is visible rather than merely claimed.
          await reloadData();
          clearDeepLink();
          toast.success('Carried over', {
            description: 'The old goal is archived. Milestones reopened on the new one.',
          });
          router.push(`/goals?goal=${newGoalId}`);
        }}
      />

      <DeleteGoalDialog
        open={deleteTarget !== null}
        goalId={deleteTarget?.id ?? null}
        goalTitle={deleteTarget?.title ?? ''}
        onClose={() => setDeleteTarget(null)}
        onArchived={async () => {
          await reloadData();
          toast.success('Goal archived');
        }}
        onDeleted={async () => {
          await reloadData();
          toast.success('Goal deleted');
        }}
      />

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}

/* ── Card wrapper: resolves the nullable pace/consistency from the hook ────── */

function GoalCardViewRenderer({
  goal,
  today,
  loadingLog,
  doneToday,
  busy,
  onToggleCheckIn,
  onOpen,
  paceFor,
  consistencyFor,
  shapeFor,
}: {
  goal: Goal;
  today: string;
  loadingLog: boolean;
  doneToday: boolean;
  busy: boolean;
  onToggleCheckIn: (id: string, next: boolean) => void;
  onOpen: (id: string) => void;
  paceFor: (id: string) => ReturnType<ReturnType<typeof useGoalsViewData>['paceFor']>;
  consistencyFor: (id: string) => ReturnType<ReturnType<typeof useGoalsViewData>['consistencyFor']>;
  shapeFor: (id: string) => ReturnType<ReturnType<typeof useGoalsViewData>['shapeFor']>;
}) {
  const pace = paceFor(goal.id);
  const consistency = consistencyFor(goal.id);

  // While the log window is in flight there is genuinely no pace, and rendering a
  // placeholder "on pace" would be a fact the page invented. A skeleton says so.
  if (loadingLog || !pace || !consistency) {
    return <GoalCardSkeleton key={goal.id} />;
  }

  return (
    <GoalCard
      goal={toCardView(goal)}
      pace={pace}
      consistency={consistency}
      goalShape={shapeFor(goal.id)}
      today={today}
      isDaily={goal.type === 'DAILY'}
      doneToday={doneToday}
      busy={busy}
      onToggleCheckIn={onToggleCheckIn}
      onOpen={onOpen}
    />
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function toCardView(goal: Goal): GoalCardView {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    type: goal.type,
    priority: goal.priority,
    unit: goal.unit,
    currentValue: goal.currentValue,
    targetValue: goal.targetValue,
    startDate: goal.startDate,
    endDate: goal.endDate,
    project: goal.project,
    appliesEveryDay: goal.appliesEveryDay,
    dayTypeNames: goal.dayTypeNames,
  };
}

function tabFor(goal: Goal): Tab {
  if (goal.status === 'COMPLETED' || goal.status === 'CANCELLED' || goal.status === 'CARRIED_OVER') {
    return 'COMPLETED';
  }
  return goal.type === 'DAILY' ? 'DAILY' : 'LONG_TERM';
}

function fleetSummary(summary: {
  doneToday: number;
  dailyTotal: number;
  behind: number;
  ahead: number;
  inFlight: number;
}): string {
  if (summary.dailyTotal === 0 && summary.inFlight === 0) return 'Nothing set yet.';

  const parts: string[] = [];
  if (summary.dailyTotal > 0) {
    parts.push(
      `${summary.doneToday} of ${summary.dailyTotal} done today`
    );
  }
  if (summary.inFlight > 0) {
    parts.push(`${summary.inFlight} in flight`);
  }
  if (summary.behind > 0) parts.push(`${summary.behind} behind pace`);
  if (summary.ahead > 0) parts.push(`${summary.ahead} ahead`);

  return `${parts.join(' · ')}.`;
}

/* ── States ───────────────────────────────────────────────────────────────── */

function SkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading goals">
      {Array.from({ length: 6 }).map((_, i) => (
        <GoalCardSkeleton key={i} />
      ))}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center"
    >
      <h2 className="text-sm font-medium text-foreground">Could not load your goals</h2>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry} className="mt-4">
        Try again
      </Button>
    </div>
  );
}

function EmptyPanel({
  tab,
  isFiltering,
  onClearFilters,
  onAdd,
}: {
  tab: Tab;
  isFiltering: boolean;
  onClearFilters: () => void;
  onAdd: () => void;
}) {
  // "No results" and "nothing here" are different states and must not share a
  // panel. Conflating them is how a failed filter looks like an empty account.
  if (isFiltering) {
    return (
      <EmptyState
        icon={<Search size={24} aria-hidden="true" />}
        title="No goals match"
        description="Nothing here fits the current search and filters."
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  const copy = {
    DAILY: {
      title: 'No daily goals',
      description:
        'Daily goals are a per-day tick. They stay on this list for their whole window, so ticking one never removes it.',
    },
    LONG_TERM: {
      title: 'Nothing in flight',
      description:
        'Set a target and a deadline. The pace track then tells you every day whether you are ahead of where the calendar says you should be.',
    },
    COMPLETED: {
      title: 'Nothing finished yet',
      description:
        'Completed, archived and carried-over goals collect here with their full history.',
    },
  }[tab];

  return (
    <EmptyState
      icon={<Target size={24} aria-hidden="true" />}
      title={copy.title}
      description={copy.description}
      action={
        tab === 'COMPLETED' ? undefined : (
          <Button variant="primary" size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add goal
          </Button>
        )
      }
    />
  );
}