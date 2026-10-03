'use client';

/**
 * The achievement showcase - a gallery and a progression system, not three rings.
 *
 * ## Why it exists as a showcase
 *
 * The previous strip was three badges in a full-width row, so a card occupying the
 * whole page had three circles in its left third and a large dead area beside
 * them. The fix is not bigger circles: it is a grid whose column count follows the
 * number of achievements that actually exist, so the available width is used
 * whether the user has earned three or twenty.
 *
 * ## Three states, three treatments
 *
 * | State | Ring | Icon | Text |
 * | ----- | ---- | ---- | ---- |
 * | `UNLOCKED` | complete + halo | full colour | `12 / 12`, unlock date, **New** chip when uncelebrated |
 * | `IN_PROGRESS` | partial | full colour at reduced opacity | `2 / 3`, "1 to go" |
 * | `LOCKED` | track only | muted | `0 / 30`, "Locked" |
 *
 * A locked badge is **not** dimmed into invisibility. The user should be able to
 * see that it exists and what it would take, which is the entire point of showing
 * it.
 *
 * ## Nothing here is invented
 *
 * Every number comes from `GET /api/achievements/showcase`, which derives the
 * earned set and the locked set from one world-state snapshot. `current: null`
 * means the app cannot measure progress toward that criterion, and is rendered
 * as "—" rather than as `0 / 30` - a zero would draw a progress ring on a badge
 * nobody has started.
 *
 * ## The unlock moment
 *
 * `celebrated` is a real column. An achievement that is unlocked but not yet
 * celebrated gets a **New** chip, which is honest and needs no client state. The
 * ring draw-on is a staggered *entrance* (A5), not a celebration replay, so it
 * never re-fires as a "you just unlocked something" moment on every page load.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Lock, RefreshCw, Sparkles, Trophy } from 'lucide-react';
import { Panel } from '@/components/dashboard-ui';
import { apiRequest } from '@/lib/api-client';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  type AchievementCategory,
  type AchievementRarity,
} from '@/lib/constants/achievements';
import { AchievementRing } from './AchievementRing';
import { cn } from '@/lib/utils';

type Item = {
  state: 'UNLOCKED' | 'IN_PROGRESS' | 'LOCKED';
  id: string;
  recordId: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  level: number;
  current: number | null;
  target: number | null;
  percent: number | null;
  unlockedAt: string | null;
  celebrated: boolean;
};

type Showcase = {
  unlocked: Item[];
  locked: Item[];
  counts: { unlocked: number; inProgress: number; locked: number; total: number };
};

const INITIAL_LOCKED = 12;

export function AchievementsShowcase() {
  const [data, setData] = useState<Showcase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    /*
      State is written inside the promise callbacks, never synchronously in the
      effect body, and every write is guarded by `cancelled` so a slow response
      arriving after unmount cannot update a component that is gone.
    */
    apiRequest<Showcase>(`/api/achievements/showcase?locked=${INITIAL_LOCKED}`)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load achievements');
        setData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const retry = () => {
    setLoading(true);
    setNonce((n) => n + 1);
  };

  /** Section title, shared by the loaded, loading and error shells. */
  const titleNode = (
    <span className="flex items-center gap-2">
      <Trophy className="h-4 w-4" style={{ color: 'var(--accent-gold)' }} aria-hidden="true" />
      Achievements
    </span>
  );

  /**
   * Header actions. `withRefresh` is false in the error state, where a refresh
   * button next to "Try again" would be the same action offered twice.
   */
  const headerAction = (withRefresh: boolean) => (
    <div className="flex items-center gap-1.5">
      {withRefresh && (
        <button
          type="button"
          onClick={retry}
          aria-label="Refresh achievements"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
        </button>
      )}
      {data && (
        <span className="rounded-full bg-[color-mix(in_oklab,var(--accent-gold)_16%,transparent)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--accent-gold)]">
          {data.counts.unlocked} unlocked
        </span>
      )}
      <Link
        href="/achievements"
        className="group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        View all
        <ArrowRight
          className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </Link>
    </div>
  );

  /**
   * Unlocked first, then the locked set closest to being earned.
   *
   * The catalogue is a fixed 20, so the grid is filled from real data rather than
   * padded: a user with 2 unlocked and 4 in reach sees six tiles, not twenty
   * ghosts.
   */
  const items = useMemo(() => {
    if (!data) return [];
    return [...data.unlocked, ...data.locked];
  }, [data]);

  const isEmpty = items.length === 0;

  /*
    The error state renders INSIDE the card, not through `Panel`'s `error` prop.

    `Panel`'s error branch replaces the whole body with a centred banner, which is
    right for a full-width panel and wrong here: this widget lives in a 5-column
    rail beside a table, and a full-panel error in a narrow column is mostly
    message and no data. It also dropped the header, so a failure moved the
    section title off the page entirely.

    `loading` is handled the same way for the same reason - a `min-h-[14rem]`
    placeholder in a 420px rail is the wrong shape.
  */
  if (error && !loading) {
    return (
      <Panel
        title={titleNode}
        hue="var(--accent-gold)"
        minHeightClass="min-h-[14rem]"
        action={headerAction(false)}
      >
        {/*
          `h-full` rather than a `min-h-[11rem]`: the error must occupy the same
          stretched cell the list does, so a failure is a card of the same shape
          with different content. A fixed min-height here is what produced a short
          card with black voids above and below it.
        */}
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
          <div
            role="alert"
            className="flex min-h-[11rem] flex-1 flex-col items-center justify-center gap-3 rounded-[14px] border border-border/50 bg-background/25 px-4 text-center"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Unable to load showcase</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted motion-reduce:transition-none"
            >
              <RefreshCw
                className={cn('h-3 w-3', loading && 'animate-spin')}
                aria-hidden="true"
              />
              Try again
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Trophy
            className="h-4 w-4"
            style={{ color: 'var(--accent-gold)' }}
            aria-hidden="true"
          />
          Achievements
        </span>
      }
      subtitle={
        data
          ? `${data.counts.unlocked} unlocked${
              data.counts.inProgress > 0 ? ` · ${data.counts.inProgress} in progress` : ''
            }`
          : undefined
      }
      // A2: gold is reserved for a genuine peak, and "a new achievement" is the
      // case the brief names.
      hue="var(--accent-gold)"
      minHeightClass="min-h-[14rem] h-full"
      loading={loading}
      loadingRows={2}
      isEmpty={!loading && isEmpty}
      empty={
        <p className="max-w-[40ch] text-sm text-muted-foreground">
          No achievements yet. The catalogue has {data?.counts.total ?? 20} to work toward - your
          first unlocks as soon as you complete a habit.
        </p>
      }
      action={headerAction(true)}
    >
      {/*
        Fills the card, not a fixed 420px.

        The row is stretched by the grid and this card is its only child, so
        `flex-1 min-h-0` makes the rail take whatever height the adjacent habit
        table sets and scroll internally. The previous `max-h-[420px]` capped it,
        so a tall table left the card short with black space under it - the card
        was the wrong height rather than the row failing to stretch.

        `max-h-[420px]` survives as a `max-` cap for the SINGLE-column layout,
        where there is no table to match and a 900px rail would just be a very
        long page. `min-h-0` on the flex child is what actually permits the
        shrink; without it `overflow-y-auto` does nothing.
      */}
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
        <div
          className="achievement-rail -mr-2 min-h-0 max-h-[420px] flex-1 overflow-y-auto pr-2 md:max-h-none"
          tabIndex={0}
          role="group"
          aria-label="Achievements list"
        >
          <ul className="flex flex-col gap-2">
            {items.map((item, i) => (
              <AchievementRow key={item.id} item={item} index={i} />
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function AchievementRow({ item, index }: { item: Item; index: number }) {
  const unlocked = item.state === 'UNLOCKED';
  const inProgress = item.state === 'IN_PROGRESS';
  const locked = item.state === 'LOCKED';

  const target = item.target;
  const measurable = !unlocked && item.current !== null && target !== null && target > 0;
  const remaining =
    measurable && target !== null && item.current !== null
      ? Math.max(0, target - item.current)
      : null;
  const percent =
    measurable && target !== null ? Math.min(100, Math.round(((item.current ?? 0) / target) * 100)) : 0;

  const category = ACHIEVEMENT_CATEGORIES[item.category];
  const rarity = ACHIEVEMENT_RARITIES[item.rarity];

  const ringLabel = unlocked
    ? `${item.name}, unlocked`
    : !measurable
      ? `${item.name}, progress unavailable`
      : `${item.name}, ${item.current} of ${target}`;

  return (
    <li>
      <div
        title={item.description}
        className={cn(
          'group flex items-center gap-3 rounded-[14px] border p-2.5',
          'transition-[transform,border-color,box-shadow,background-color] duration-200 ease-out',
          'motion-reduce:transition-none',
          unlocked
            ? 'border-[color-mix(in_oklab,var(--accent-gold)_28%,transparent)] bg-[color-mix(in_oklab,var(--accent-gold)_7%,transparent)]'
            : inProgress
              ? 'border-border/70 bg-background/40 hover:border-primary/40'
              : 'border-border/50 bg-background/20 hover:border-border/70'
        )}
      >
        {/*
          Icon badge, fixed 40x40. The ring carries the number and the row carries
          the name, so the icon is state, not a second data readout - and because it
          is a fixed-size box, a long name next to it cannot reflow it.
        */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          <AchievementRing
            percent={unlocked ? 100 : item.percent}
            hue={unlocked ? 'var(--accent-gold)' : item.color}
            size="sm"
            complete={unlocked}
            index={index}
            label={ringLabel}
          />
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full',
              unlocked ? 'shimmer-holographic overflow-hidden' : 'opacity-45 grayscale'
            )}
          >
            <span
              className="text-sm leading-none transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              style={locked ? undefined : { filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))' }}
            >
              {item.icon}
            </span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p
              className={cn(
                'truncate text-sm font-semibold leading-tight',
                unlocked
                  ? 'text-[color-mix(in_oklab,var(--accent-gold)_85%,var(--foreground))]'
                  : 'text-foreground'
              )}
            >
              {item.name}
            </p>
            <span
              className="shrink-0 text-[9px] font-semibold uppercase tracking-wide"
              style={{ color: category.color, opacity: unlocked ? 1 : 0.7 }}
            >
              {category.label}
            </span>
          </div>

          <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
            {item.description}
          </p>

          {/*
            The bar is the row's progress readout, and it is hidden when the
            criterion is not measurable. A 0% bar on an achievement the app cannot
            score is a claim, not a measurement - the same reason `current: null`
            renders as an em dash rather than a zero.
          */}
          {measurable && (
            <div className="mt-1.5 flex items-center gap-2">
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={item.name}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                  style={{
                    width: `${percent}%`,
                    background: unlocked
                      ? 'var(--accent-gold)'
                      : 'linear-gradient(90deg, color-mix(in oklch, var(--accent-habits) 60%, transparent), var(--accent-habits))',
                  }}
                />
              </div>
              <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {item.current}/{target}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {unlocked ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[color-mix(in_oklab,var(--accent-gold)_18%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--accent-gold)]">
              {item.celebrated ? (
                'Done'
              ) : (
                <>
                  <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                  New
                </>
              )}
            </span>
          ) : locked ? (
            <Lock className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
          ) : (
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
              {remaining === 0 ? 'Ready' : remaining === 1 ? '1 to go' : `${remaining} to go`}
            </span>
          )}

          <span className="text-[9px]" style={{ color: rarity.color, opacity: unlocked ? 0.95 : 0.6 }}>
            {rarity.label}
          </span>

          {unlocked && item.unlockedAt && (
            <span className="text-[9px] tabular-nums text-muted-foreground/80">
              {new Date(item.unlockedAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

