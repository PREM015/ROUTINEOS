'use client';

/**
 * `/achievements` - the badge gallery, the trophy level, and the unlock history.
 *
 * ## One request, one derivation
 *
 * This page used to issue two (`/api/achievements` for the earned rows,
 * `/api/achievements/next?count=100` for locked progress) and then re-derived
 * everything itself: each row's rarity through `xpForRow`, the XP total, the
 * rarity counts, the day grouping. The dashboard card asked
 * `/api/achievements/showcase` instead and read the rarity the server had already
 * resolved.
 *
 * Two derivations of one fact is two chances to disagree, and a badge could show
 * as Common in the grid and Epic in the history. The page now asks for the same
 * single snapshot the dashboard asks for and maps it through
 * `buildAchievementViewModel`, so the trophy total, the rarity chips, the grid
 * and the history read the same numbers by construction. It is also one request
 * instead of two, and `buildWorldState` runs once instead of twice.
 *
 * ## The failure that motivated the states below
 *
 * Loading gated on `!rows && !error`. On a failed request both were set, so the
 * spinner was skipped and the page rendered its full body against `rows === null`:
 * level 1, 0 XP, twenty locked badges, history reading "No unlocks yet". A failed
 * request looked like a real, complete, entirely false account. Loading, error
 * and first-run are now three distinct branches - see `AchievementStates.tsx`.
 *
 * ## Filters live in the URL
 *
 * Status, rarity, category and sort are read from the query string and written
 * back with `router.replace`, so a filtered view can be linked and survives
 * navigation. They were `useState` before, which meant they reset on every route
 * change and could never be shared.
 *
 * `?highlight=<definitionId>` opens that badge's detail panel and rings its tile.
 * It is the destination the notification and email deep links need; those links
 * currently point at `/achievements/${id}`, which is not a route.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Medal, Sparkles, Trophy } from 'lucide-react';
import {
  DEFAULT_FILTERS,
  buildAchievementViewModel,
  filterAndSortTiles,
  isAchievementView,
  isAchievementCategory,
  isAchievementRarity,
  isAchievementSort,
  isAchievementStatusFilter,
  isDefaultFilters,
  type AchievementDensity,
  type AchievementFilters,
  type AchievementView,
  type AchievementTile,
  type ShowcasePayload,
} from '@/lib/achievements/view-model';
import { getAchievementById } from '@/lib/achievements/definitions';
import { lifetimeStats, nextLevelRoute } from '@/lib/achievements/derived';
import { apiRequest } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { useAuth } from '@/hooks/useAuth';
import { useDevicePreference, DEVICE_PREF } from '@/hooks/useDevicePreference';
import { markAchievementCelebrated } from '@/store/achievement.store';
import { Stagger } from '@/components/today/ui';
import { TrophyHero } from '@/components/achievements/TrophyHero';
import { NextUpCarousel } from '@/components/achievements/NextUpCarousel';
import { JourneySection } from '@/components/achievements/JourneySection';
import { TimelineView } from '@/components/achievements/TimelineView';
import { AchievementList } from '@/components/achievements/AchievementList';
import { AchievementControlBar } from '@/components/achievements/AchievementControlBar';
import { AchievementDetailDrawer } from '@/components/achievements/AchievementDetailDrawer';
import {
  AchievementErrorState,
  AchievementFirstRun,
  AchievementPageSkeleton,
} from '@/components/achievements/AchievementStates';

/**
 * Ask for every locked badge, not a subset.
 *
 * The route caps `locked` at 40 and the catalogue holds 20 definitions, so this
 * returns the whole thing and cannot be silently truncated. The dashboard card
 * deliberately asks for fewer, because it lives in a narrow rail - but two
 * different numbers on the same domain is how a page ends up disagreeing with its
 * own summary.
 */
const SHOWCASE_URL = '/api/achievements/showcase?locked=40';

const URL_KEYS = {
  status: 'status',
  rarity: 'rarity',
  category: 'category',
  sort: 'sort',
  view: 'view',
  query: 'q',
  highlight: 'highlight',
} as const;

/**
 * Read the filter values out of a query string.
 *
 * Each value is validated against the same guards the view model exports rather
 * than cast, so a hand-edited or stale link (`?rarity=CUSTOM&sort=CHEAP`) degrades
 * to the default instead of rendering an empty gallery with no way back.
 */
function filtersFromParams(params: URLSearchParams): AchievementFilters {
  const status = params.get(URL_KEYS.status);
  const rarity = params.get(URL_KEYS.rarity);
  const category = params.get(URL_KEYS.category);
  const sort = params.get(URL_KEYS.sort);

  return {
    status: status && isAchievementStatusFilter(status) ? status : DEFAULT_FILTERS.status,
    rarity: rarity && isAchievementRarity(rarity) ? rarity : DEFAULT_FILTERS.rarity,
    category:
      category && isAchievementCategory(category) ? category : DEFAULT_FILTERS.category,
    sort: sort && isAchievementSort(sort) ? sort : DEFAULT_FILTERS.sort,
    // Not validated: it is free text, and any string is a legitimate query. Only a
    // missing key means "no query".
    query: params.get(URL_KEYS.query) ?? DEFAULT_FILTERS.query,
  };
}

function viewFromParams(params: URLSearchParams): AchievementView {
  const view = params.get(URL_KEYS.view);
  return view && isAchievementView(view) ? view : 'SHELVES';
}

function AchievementsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { timezone, today } = useUserTimezone();

  const [payload, setPayload] = useState<ShowcasePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [nonce, setNonce] = useState(0);
  /**
   * The tile the user opened by clicking, as opposed to the one a `?highlight=`
   * link named. Kept separate because the two have to coexist: arriving on a
   * highlighted link and then clicking a different badge must show the clicked
   * one, and dismissing the panel must clear the click but leave the URL alone.
   */
const [manualSelection, setManualSelection] = useState<AchievementTile | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiRequest<ShowcasePayload>(SHOWCASE_URL)
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Drop any stale payload, so a retry that also fails cannot leave the
        // previous account's numbers on screen next to an error.
        setPayload(null);
        setError(err instanceof Error ? err.message : 'Failed to load achievements');
      })
      .finally(() => {
        if (!cancelled) setRetrying(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const filters = useMemo(() => filtersFromParams(new URLSearchParams(searchParams)), [searchParams]);
  const view = useMemo(() => viewFromParams(new URLSearchParams(searchParams)), [searchParams]);
  const highlightId = searchParams.get(URL_KEYS.highlight);

  /*
    Density is the one control that lives on the device rather than in the URL: it
    is a property of the screen in front of you, not of the thing being linked to,
    and two people sharing a link should each get the layout that suits them.

    Read through `useDevicePreference`, which uses `useSyncExternalStore` so the
    server render and the first client render agree (no `localStorage` on the
    server) and there is no `setState`-in-effect cascade. Namespaced by user id, so
    a shared browser does not leak one account's density to another, and a missing
    or full `localStorage` leaves the default rather than throwing.
  */
  const { user } = useAuth();
  const [density, setDensity] = useDevicePreference<AchievementDensity>(
    user?.id,
    DEVICE_PREF.density,
    'COMFORTABLE'
  );

  /**
   * `router.replace`, not `push`: changing a filter is not navigation, and
   * pushing would fill the history with a dozen filter states so Back walks
   * through filter combinations instead of leaving the page.
   *
   * Default values are removed from the URL rather than serialised, so the common
   * case stays a clean `/achievements`.
   */
  const applyFilters = useCallback(
    (next: AchievementFilters) => {
      const params = new URLSearchParams(searchParams);
      for (const key of Object.values(URL_KEYS)) {
        if (key === URL_KEYS.highlight) continue;
        params.delete(key);
      }
      if (next.status !== DEFAULT_FILTERS.status) params.set(URL_KEYS.status, next.status);
      if (next.rarity !== DEFAULT_FILTERS.rarity) params.set(URL_KEYS.rarity, next.rarity);
      if (next.category !== DEFAULT_FILTERS.category) params.set(URL_KEYS.category, next.category);
      if (next.sort !== DEFAULT_FILTERS.sort) params.set(URL_KEYS.sort, next.sort);
      if (next.query.trim() !== '') params.set(URL_KEYS.query, next.query);

      const query = params.toString();
      router.replace(query ? `/achievements?${query}` : '/achievements', { scroll: false });
    },
    [router, searchParams]
  );

  /** View mode is in the URL, so a shared link keeps the layout it was shared in. */
  const applyView = useCallback(
    (next: AchievementView) => {
      const params = new URLSearchParams(searchParams);
      for (const key of Object.values(URL_KEYS)) {
        if (key === URL_KEYS.highlight) continue;
        params.delete(key);
      }
      if (next !== 'SHELVES') params.set(URL_KEYS.view, next);
      const query = params.toString();
      router.replace(query ? `/achievements?${query}` : '/achievements', { scroll: false });
    },
    [router, searchParams]
  );

  const clearHighlight = useCallback(() => {
    if (!highlightId) return;
    const params = new URLSearchParams(searchParams);
    params.delete(URL_KEYS.highlight);
    const query = params.toString();
    router.replace(query ? `/achievements?${query}` : '/achievements', { scroll: false });
  }, [router, searchParams, highlightId]);

  /**
   * The single derivation of everything the page renders.
   *
   * One memo over `(payload, timezone)` means the trophy total, the rarity chips,
   * the grid, the next-up strip and the history cannot disagree: they are all
   * reading fields off this one object.
   */
  const vm = useMemo(
    () => (payload ? buildAchievementViewModel(payload, timezone) : null),
    [payload, timezone]
  );

  /**
 * A `?highlight=` target opens its detail panel on arrival, which is what makes
   * the notification and email links land on the right badge rather than on a
   * generic gallery.
   *
   * Derived during render rather than copied into state by an effect. An effect
   * would have to wait for the payload before it could resolve the id, so the
   * panel would open a frame late and re-fire on every new snapshot; and an id
   * that no longer resolves - a retired definition - would leave the effect
   * holding nothing, so the link dead-ended instead of falling through to the
   * gallery. `?? null` here is what makes a stale link degrade.
   */
  const highlightedTile = useMemo(() => {
    if (!highlightId || !vm) return null;
    return vm.tiles.find((tile) => tile.id === highlightId) ?? null;
  }, [highlightId, vm]);

  const selectedTile = manualSelection ?? highlightedTile;

  /*
    AC18, second half: opening a badge's detail panel is the other moment the user
    has demonstrably seen it, so an unseen badge is marked seen there too. Only
    `isNew` tiles are sent, so a re-opened badge makes no request at all, and the
    write is fire-and-forget.
   */
  const selectTile = useCallback((tile: AchievementTile) => {
    setManualSelection(tile);
    if (tile.isNew) void markAchievementCelebrated(tile.recordId);
  }, []);

  /*
    The two derived folds the hero needs, memoised beside the view model so they are
    computed once per data load rather than once per render. Both read `vm`, so
    there is still exactly one place on this page where XP is derived.

    Declared here rather than next to their use, because the loading and error
    branches below return early - a hook below an early return is a conditional
    hook call, which breaks the Rules of Hooks the moment the payload arrives and
    the component takes a different path.
  */
  const derived = useMemo(() => {
    if (!vm) return null;
    return {
      stats: lifetimeStats(vm.earned),
      route: nextLevelRoute(vm.levelInfo, vm.tiles),
      // The count the control bar announces. Computed from the same filter the
      // collection uses, so "12 of 20 shown" cannot disagree with what is on screen.
      visibleCount: filterAndSortTiles(vm.tiles, filters).length,
      /** By id, so the timeline can hand a history row the full tile to open. */
      tilesById: new Map(vm.tiles.map((t) => [t.id, t])),
    };
  }, [vm, filters]);

  const retry = () => {
    // Clearing the error here rather than inside the effect: this is a user event,
    // so it is the honest place to reset, and it keeps the effect free of a
    // synchronous `setState` that would cause a cascading render on every retry.
    setError(null);
    setRetrying(true);
    setNonce((n) => n + 1);
  };

  const closeDrawer = useCallback(
    (open: boolean) => {
      if (!open) {
        setManualSelection(null);
        clearHighlight();
      }
    },
    [clearHighlight]
  );

  const header = (
    <header className="mb-6 sm:mb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          <Trophy className="h-7 w-7 text-[var(--accent-gold)]" aria-hidden="true" />
          Achievements
        </h1>
        {vm && vm.unseenCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--accent-gold)_18%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-gold)]">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {vm.unseenCount} new
          </span>
        )}
      </div>
      {vm ? (
        <p className="mt-2 text-muted-foreground">
          {vm.earned.length} of {vm.tiles.length} unlocked
          {!vm.isFirstRun && vm.nextUp.length > 0
            ? ` · closest is ${vm.nextUp[0]?.name}`
            : ''}
          .
        </p>
      ) : (
        <p className="mt-2 text-muted-foreground">Track milestones as you build consistency.</p>
      )}
    </header>
  );

  if (error) {
    return (
      <div className="container relative mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div
          className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
          aria-hidden="true"
        />
        <div className="relative">
          {header}
          <AchievementErrorState message={error} onRetry={retry} retrying={retrying} />
        </div>
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="container relative mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div
          className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
          aria-hidden="true"
        />
        <div className="relative">
          {header}
          <AchievementPageSkeleton />
        </div>
      </div>
    );
  }

  const { levelInfo, rarityCounts } = vm;
  const stats = derived?.stats ?? null;
  const route = derived?.route ?? null;
  const visibleCount = derived?.visibleCount ?? 0;
  const tilesById = derived?.tilesById ?? new Map<string, AchievementTile>();

  return (
    <div className="container relative mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div
        className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden="true"
      />

      <div className="relative">
        <Stagger>{header}</Stagger>

        {/*
          Trophy hero (AC1-AC4). Every number it shows comes from `vm`, the single
          memo over the showcase payload - so the ring, the spectrum and the grid are
          reading the same XP figures by construction rather than by review.
        */}
        <Stagger delay={0.06}>
          <TrophyHero
            level={levelInfo.level}
            levelProgress={levelInfo.progress}
            totalXp={vm.totalXp}
            currentXp={levelInfo.currentXp}
            neededForNext={levelInfo.neededForNext}
            nextLevelAt={levelInfo.nextLevelAt}
            maxed={levelInfo.maxed}
            rarityCounts={rarityCounts}
            totalBadges={vm.tiles.length}
            stats={stats}
            route={route}
            filters={filters}
            onFiltersChange={applyFilters}
          />
        </Stagger>

        {/*
          Next-up carousel (AC5). Only badges the app can actually measure appear
          here; an untracked criterion has no position in a "closest to" ranking, so
          it is excluded rather than shown with a fabricated percentage.
        */}
        {vm.nextUp.length > 0 && (
          <Stagger delay={0.1}>
            <div className="mt-6">
              <NextUpCarousel
                tiles={vm.tiles}
                fieldFor={criterionFieldOf}
                onSelect={selectTile}
              />
            </div>
          </Stagger>
        )}
        {vm.hasUnmeasurable && (
          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              A few badges don&apos;t report progress, so they show no bar. They still unlock
              automatically when you meet the condition.
            </span>
          </p>
        )}

        {/*
          First run. Above the gallery, not below it: twenty locked tiles with no
          explanation is a wall, and the explanation is the reason to keep looking.
          Suppressed while a filter is active, because then the empty state belongs
          to the filter and says so.
        */}
        {vm.isFirstRun && isDefaultFilters(filters) && (
          <Stagger delay={0.12}>
            <div className="mt-6">
              <AchievementFirstRun total={vm.tiles.length} />
            </div>
          </Stagger>
        )}

        {/* Collection: control bar, then the shelves / grid / list. */}
        <Stagger delay={0.14}>
          <div className="mt-8">
            <AchievementControlBar
              tiles={vm.tiles}
              filters={filters}
              onFiltersChange={applyFilters}
              view={view}
              onViewChange={applyView}
              density={density}
              onDensityChange={setDensity}
              resultCount={visibleCount}
              totalCount={vm.tiles.length}
            />
            <AchievementList
              tiles={vm.tiles}
              filters={filters}
              view={view}
              density={density}
              highlightedId={highlightId}
              onSelect={selectTile}
            />
          </div>
        </Stagger>

        {/*
          Journey (AC14, AC16, AC17) and the timeline (AC15, AC26). Both read the
          derived layer: the curve, its level bands, the milestone markers, the
          cadence buckets and the month comparison are all computed there, so this
          page still has exactly one place where XP and level are derived.
        */}
        {vm.earned.length > 0 && (
          <Stagger delay={0.2}>
            {/* A ruled heading so each band reads as its own place rather than one
                long undifferentiated column. */}
            <section className="mt-12" aria-labelledby="journey-heading">
              <div className="mb-4 flex items-center gap-3">
                <h2
                  id="journey-heading"
                  className="text-xl font-bold tracking-tight text-foreground"
                >
                  Journey
                </h2>
                <span aria-hidden="true" className="h-px flex-1 bg-[var(--ach-hairline)]" />
              </div>
              <JourneySection earned={vm.earned} timezone={timezone} today={today} />
            </section>
          </Stagger>
        )}

        <Stagger delay={0.24}>
          <section className="mt-12" aria-labelledby="unlock-history-heading">
            <h2
              id="unlock-history-heading"
              className="mb-4 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"
            >
              <Medal className="h-5 w-5 text-[var(--accent-gold)]" aria-hidden="true" />
              Unlock History
            </h2>
            <TimelineView
              earned={vm.earned}
              timezone={timezone}
              tilesById={tilesById}
              onSelect={selectTile}
            />
          </section>
        </Stagger>
      </div>

      <AchievementDetailDrawer tile={selectedTile} open={selectedTile !== null} onOpenChange={closeDrawer} />
    </div>
  );
}

/**
 * The criterion field behind a tile, used only to phrase "4 more days" with the
 * right noun.
 *
 * Read from the catalogue rather than carried on the payload: `ACHIEVEMENT_XP` and
 * rarity travel with the row because they are stored, but the criterion is static
 * config, and duplicating it into the showcase payload would be a second copy to
 * keep in step. A tile whose definition is retired yields `undefined`, and
 * `remainingPhrase` then omits the phrase rather than guessing.
 */
function criterionFieldOf(tile: { id: string }): string | undefined {
  return getAchievementById(tile.id)?.criteria[0]?.field;
}

export default function AchievementsPage() {
  /*
    `useSearchParams` opts a route into client rendering, and Next requires a
    Suspense boundary above it or the build fails. The fallback is the real
    skeleton rather than a spinner, so the boundary is not a visible downgrade.
  */
  return (
    <Suspense fallback={<AchievementPageSkeleton />}>
      <AchievementsPageInner />
    </Suspense>
  );
}
