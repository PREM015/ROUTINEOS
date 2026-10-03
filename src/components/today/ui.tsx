'use client';

import { motion, useReducedMotion } from 'framer-motion';
import {
  useCallback,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Per-card accent hues.
 *
 * ## Why this map instead of new colours
 *
 * `globals.css` already declares an eight-hue accent scale for **both** themes
 * (`--accent-score`, `--accent-habits`, `--accent-goals`, `--accent-sleep`,
 * `--accent-routine`, `--accent-focus`, `--accent-streak`, `--accent-insights`),
 * each with a light `:root` value and a lightened `.dark` counterpart, and each
 * already mapped into `@theme inline` as `--color-accent-*`.
 *
 * Those tokens had **zero references anywhere outside `globals.css`** — every
 * surface on this page was wired to `var(--primary)` instead, which is why the
 * whole grid rendered as one shade of green. The palette was designed and then
 * never connected. Reading it through `var()` rather than hardcoding hex values
 * means light and dark both stay correct with no second `dark:` variant per
 * element, and `accent="primary"` remains available for anything that should
 * keep following the brand token.
 */
const ACCENTS = {
  score: 'var(--accent-score)',
  habits: 'var(--accent-habits)',
  goals: 'var(--accent-goals)',
  sleep: 'var(--accent-sleep)',
  routine: 'var(--accent-routine)',
  focus: 'var(--accent-focus)',
  streak: 'var(--accent-streak)',
  insights: 'var(--accent-insights)',
  planning: 'var(--accent-planning)',
  primary: 'var(--primary)',
} as const;

export type Accent = keyof typeof ACCENTS;

/** Class for an accent-coloured icon/heading, matching {@link ACCENTS}. */
export function accentText(accent: Accent): string {
  return { score: 'text-accent-score', habits: 'text-accent-habits', goals: 'text-accent-goals',
    sleep: 'text-accent-sleep', routine: 'text-accent-routine', focus: 'text-accent-focus',
    streak: 'text-accent-streak', insights: 'text-accent-insights', planning: 'text-accent-planning', primary: 'text-primary' }[accent];
}

/**
 * `/today` design primitives — **sealed to this page**.
 *
 * ## Why this exists instead of upgrading `components/ui`
 *
 * `components/ui/Card.tsx` has 54 import sites and `Button.tsx` has 66, across
 * every page. Restyling those would make a `/today` redesign a live experiment
 * on the whole app: one mistake breaks `/recap`, `/goals` and the rest at once.
 *
 * So this module deliberately imports **nothing** from `components/ui`. The
 * dependency arrow points one way — `/today` used to depend on the shared
 * folder, and now it does not. Editing a shared primitive can no longer change
 * this page, and edits here cannot leak out.
 *
 * The 3 or 4 definitions duplicated against the shared folder are the price of
 * that isolation, and it is the right trade: a page you cannot restyle safely is
 * not worth keeping.
 *
 * ## 2.1 — soft glass on an animated mesh
 *
 * One frosted shell for all eight cards, with a border that glows. Colours come
 * from the theme tokens in `globals.css`, so the same definitions are correct in
 * light and dark — which is what fixes the contrast bugs, rather than a second
 * `dark:` variant per element.
 */

export function GlassPanel({
  children,
  className,
  /** Card heading rendered in the top-left of the panel. */
  title,
  /** Small slot next to the title, e.g. a badge or an action. */
  action,
  interactive = true,
  /**
   * Hue for this panel's washes, sheen and icon tint.
   *
   * Defaults to `primary` so an un-upgraded caller keeps its current appearance.
   */
  accent = 'primary',
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
  interactive?: boolean;
  accent?: Accent;
} & Omit<HTMLAttributes<HTMLDivElement>, 'title'>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  /**
   * The hue is published as a custom property rather than injected as classes
   * because the washes are `color-mix()` gradients, which cannot be expressed
   * as a utility class. `--panel-accent` is always set (the prop defaults to
   * `primary`), so the gradients below can read it with no fallback chain —
   * which also keeps the arbitrary Tailwind values parseable.
   */
  const panelStyle = {
    ...style,
    '--panel-accent': ACCENTS[accent],
  } as CSSProperties;

  /**
   * 2.11 — cursor-following highlight, desktop only.
   *
   * The radial gradient's position is written straight to a CSS custom property
   * on `pointermove`. That is the cheapest possible approach: no state, so no
   * re-render, and no work at all when the pointer never enters the card.
   *
   * Guarded on `matchMedia('(hover: hover)')` because on touch the "pointer"
   * is a finger and the highlight would smear behind it.
   */
  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    },
    [reduced]
  );

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      style={panelStyle}
      className={cn(
        // Frosted surface. `backdrop-blur-xl` over the mesh behind it is the
        // "glass"; `bg-card/70` keeps text contrast stable on both themes.
        'glass-panel group relative flex h-full flex-col overflow-hidden rounded-2xl',
        'border border-white/10 dark:border-white/[0.07]',
        'shadow-soft transition-[box-shadow,transform] duration-300',
        'motion-reduce:transition-none',
        interactive && 'hover:-translate-y-0.5 hover:shadow-floating',
        // Press feedback, for touch and for keyboard users.
        'active:translate-y-0 active:scale-[0.995] motion-reduce:active:scale-100',
        className
      )}
      {...rest}
    >
      {/* 2.11 — the highlight that tracks the cursor. `--mx`/`--my` default to
          the centre so it reads as a soft even wash before the first hover. */}
      {interactive && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
            'group-hover:opacity-100',
            'bg-[radial-gradient(240px_circle_at_var(--mx,50%)_var(--my,50%),color-mix(in_srgb,var(--panel-accent)_16%,transparent),transparent_70%)]'
          )}
        />
      )}

      {/* 2.1 — a permanent corner wash so depth is visible even with no hover.
          This is the main reason the grid no longer reads as one flat shade:
          each card now carries its own hue in the corner, in both themes. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_srgb,var(--panel-accent)_14%,transparent),transparent_62%)]"
      />

      {/* A second wash from the opposite corner, so a wide card has colour at
          both ends rather than only where the header sits. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_100%_100%,color-mix(in_srgb,var(--panel-accent)_9%,transparent),transparent_60%)]"
      />

      {/* 2.12 — a top edge highlight that reads as a lit bevel in both themes,
          tinted with the card's own hue rather than plain white. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--panel-accent)] to-transparent opacity-60"
      />

      {/*
        Matches the card bodies (`px-4 pb-4 sm:px-5`). The header was `px-5`
        while bodies were `px-4` below `sm`, so a card's heading sat 4px to the
        right of the content under it on mobile — visible as a ragged left edge
        on exactly the two cards this pass is about.
      */}
      {(title || action) && (
        <div className="relative flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
          {title && (
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h2>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * Card body padding.
 *
 * Separate from {@link GlassPanel} so a panel can choose its own density —
 * dense for the score ring, roomy for a reflection form.
 */
export function PanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('px-5 pb-5 pt-1', className)}>{children}</div>;
}

export function PanelHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    /* `px-4 sm:px-5` to match `PanelHeader` and the card bodies, so the label
       and its inputs share one left edge at every breakpoint. */
    <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Pill used for the notification-style tags and status chips. */
export function Tag({
  children,
  tone = 'primary',
  className,
}: {
  children: ReactNode;
  tone?: 'primary' | 'muted' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    primary: 'bg-primary/15 text-primary',
    muted: 'bg-muted text-muted-foreground',
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    danger: 'bg-destructive/15 text-destructive',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Staggered entrance for a grid of panels (2.10).
 *
 * `useReducedMotion` is honoured, and so is the user's own `animationsEnabled`
 * setting, which the settings store projects onto `<html>` as `.reduce-motion`.
 * CSS handles the second; this hook handles the first.
 */
export function Stagger({
  children,
  className,
  delay = 0,
  id,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /**
   * Optional anchor id.
   *
   * The `/today` columns are plain flex stacks, so there is no grid cell to hang
   * an anchor off any more. `Stagger` is the outermost element of each card, so
   * it is where the palette's scroll targets ("Jump to reflection") now live.
   */
  id?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      id={id}
      className={className}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0 : 0.45,
        delay: reduced ? 0 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Loading placeholder that reserves the panel's height (2.10).
 *
 * The previous skeletons were fixed-height guesses, so the layout jumped when
 * real content replaced them. `min-h` plus a matching block structure keeps the
 * footprint close to the real thing.
 */
export function PanelSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'glass-panel animate-pulse rounded-2xl border border-white/10 p-5 dark:border-white/[0.07]',
        className
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-4 h-4 w-1/3 rounded bg-muted" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="mb-2 h-3 rounded bg-muted/70"
          style={{ width: `${100 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Empty state with a visible boundary (2.1 / ERROR.md B4).
 *
 * The shared `EmptyState` was borderless, so "No goals set yet" floated with no
 * container and read as missing content rather than an intentional state.
 */
export function PanelEmpty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center">
      {icon && <div className="mb-1 text-muted-foreground/70">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
