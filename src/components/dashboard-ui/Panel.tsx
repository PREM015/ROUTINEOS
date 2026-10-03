'use client';

/**
 * `Panel` - the dashboard card surface, and the four states every card needs.
 *
 * Having all four in one place is the point. Three of the bugs fixed on this
 * page were a state that did not *exist*, not a state that looked wrong:
 * `GoalsWidget` had no loading state at all, `ContributionHeatmap` had no
 * empty state, and `RoutineWidget` had no retry. Centralising the states means a
 * new widget cannot repeat those mistakes by omission.
 *
 * ## The material (A3)
 *
 * Every panel is the three-layer glass of the design DNA - blur, a 135deg
 * domain-tint, and a light-grazing edge - applied via `.glass-panel` from
 * globals.css rather than reimplemented here. `--glass-hue` is set from the
 * `domain` prop, so a card looks like it belongs to its domain before you read a
 * word of it, and dark mode stays a token swap rather than a per-call-site
 * `dark:` class.
 *
 * `.glass-panel-lift` supplies the hover behaviour. It is opt-in rather than
 * baked in here for the reason documented in globals.css: roughly 40 call sites
 * across the app pair `.glass-panel` with their own `hover:-translate-y-*`, and
 * both selectors have equal specificity, so baking the lift in would override
 * them depending on stylesheet order.
 *
 * `Panel` is a plain surface. If you need a different anatomy, use `MetricCard`
 * (icon -> number -> ring -> line) rather than fighting this one.
 */

import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAnimationsEnabled } from '@/hooks/useThemeTransition';
import { DOMAIN_ACCENT, accentTint, type Domain } from './accent';
import { ELEVATION, MOTION, RADIUS } from './tokens';
import { cn } from '@/lib/utils';

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /**
   * Optional because the `loading` / `error` / `isEmpty` branches render their
   * own content and callers should not have to pass a dummy child.
   */
  children?: ReactNode;
  /** Heading rendered top-left. */
  title?: ReactNode;
  /** Small slot beside the title - a badge, a filter, an action. */
  action?: ReactNode;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Disables the cursor-follow highlight and the hover lift. */
  interactive?: boolean;
  /** Renders the placeholder instead of `children`. */
  loading?: boolean;
  /** Rows of placeholder in the loading state. */
  loadingRows?: number;
  /** Matches the loaded height so the grid does not resize when data lands. */
  minHeightClass?: string;
  /** Rendered instead of `children` when there is genuinely nothing to show. */
  empty?: ReactNode;
  /** Set by the caller: is there nothing to show? */
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Domain hue for the glass tint and the loading placeholder. */
  domain?: Domain;
  /**
   * Overrides `domain` for cards whose identity sits outside the eight domains.
   *
   * Achievements are the one case: A2 reserves gold for "a new achievement", so
   * the strip's hue is `--accent-gold` rather than any `DOMAIN_ACCENT` entry.
   * Reaching for `domain="streak"` would give it flame-orange, which is a
   * different, less earned signal.
   */
  hue?: string;
  /**
   * B6: a cyan-violet duotone wash instead of a single domain hue.
   *
   * Reserved for synthesised and narrative content (AI Insight, Weekly Recap).
   * It is a genuinely useful signal rather than decoration: a reader can tell
   * "this number came out of your logs" from "this sentence was composed about
   * your logs" without reading either.
   */
  duotone?: boolean;
  /** Overrides the tint strength. B1's hero card uses a stronger 9%. */
  tintPercent?: number;
}

export function Panel({
  children,
  title,
  action,
  subtitle,
  interactive = true,
  loading = false,
  loadingRows = 3,
  minHeightClass,
  empty,
  isEmpty = false,
  error = null,
  onRetry,
  domain,
  hue: hueOverride,
  duotone = false,
  tintPercent,
  className,
  ...rest
}: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const animations = useAnimationsEnabled();
  const [highlight, setHighlight] = useState(false);

  // A single source of truth for "can this animate": the OS preference AND the
  // in-app `animationsEnabled` setting, which is the one that was previously
  // ignored by every framer-motion animation on the page.
  const still = reduced || !animations;

  useEffect(() => {
    const el = ref.current;
    if (!interactive || !el) return;
    // Coarse pointers have no cursor to follow, and a mousemove handler running
    // on touch drains battery for nothing.
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      // Written straight to CSS custom properties: going through React state
      // would re-render the whole card on every mouse move.
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, [interactive]);

  const hue = hueOverride ?? (duotone ? 'var(--accent-insights)' : DOMAIN_ACCENT[domain ?? 'score'].hue);
  const cardRadius = `rounded-[${RADIUS.card}]`;

  const material = cn(
    'glass-panel relative flex h-full flex-col overflow-hidden',
    interactive && 'glass-panel-lift',
    MOTION.ease,
    'active:translate-y-0 active:scale-[0.995]',
    still && 'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
    className
  );

  const style = {
    ['--glass-hue' as string]: hue,
    ...(tintPercent === undefined ? {} : { ['--glass-tint' as string]: `${tintPercent}%` }),
  } as CSSProperties;

  const header = (title || action || subtitle) && (
    <PanelHeader title={title} action={action} subtitle={subtitle} />
  );

  if (loading) {
    return (
      <div
        ref={ref}
        className={cn(material, cardRadius, ELEVATION.raised, minHeightClass)}
        style={style}
        aria-busy="true"
        aria-label={typeof title === 'string' ? `Loading ${title}` : 'Loading'}
      >
        {header}
        <div className="flex flex-1 flex-col gap-2.5 p-5 pt-0">
          {/*
            Only the leading row takes the domain accent; the rest stay neutral so
            the placeholder does not read as a colour key.
          */}
          {Array.from({ length: loadingRows }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'animate-pulse rounded-lg motion-reduce:animate-none',
                i === 0 && loadingRows > 2 ? 'h-16' : 'h-12'
              )}
              style={{
                backgroundColor:
                  i === 0 && domain ? accentTint(DOMAIN_ACCENT[domain].hue, 18) : 'var(--muted)',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        ref={ref}
        className={cn(material, cardRadius, ELEVATION.raised, minHeightClass)}
        style={style}
        {...rest}
      >
        {header}
        {/*
          A calm inline banner inside the card's own footprint. It must never
          collapse the card to zero height - that is what made a failed refetch
          look like a layout change elsewhere on the page.
        */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5 pt-0 text-center">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive/70" aria-hidden="true" />
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isEmpty && empty) {
    return (
      <div
        ref={ref}
        className={cn(material, cardRadius, ELEVATION.raised, minHeightClass)}
        style={style}
        {...rest}
      >
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-5 pt-0 text-center">
          {empty}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(material, cardRadius, ELEVATION.raised, minHeightClass)}
      style={style}
      onMouseEnter={() => interactive && setHighlight(true)}
      onMouseLeave={() => setHighlight(false)}
      {...rest}
    >
      {/* Cursor-following highlight, desktop + fine pointers only. */}
      {interactive && !still && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity',
            RADIUS.card,
            highlight ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            background:
              'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--glass-hue) 12%, transparent), transparent 70%)',
          }}
        />
      )}
      {header}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function PanelHeader({
  title,
  action,
  subtitle,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  if (!title && !action && !subtitle) return null;
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-5',
        className
      )}
    >
      <div className="min-w-0">
        {title && <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>}
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function PanelSkeletonLine({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-muted motion-reduce:animate-none', className)} />
  );
}
