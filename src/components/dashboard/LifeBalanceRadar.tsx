'use client';

/**
 * Life Balance — "what am I neglecting this week?", in one glance.
 *
 * ## The defect this rewrite fixes
 *
 * **The chart rendered as a thin line through two spokes instead of a filled
 * hexagon.**
 *
 * The cause was structural, not cosmetic: *every* piece of geometry derived its
 * spoke count from `axes.length` —
 *
 * ```ts
 * const count = axes.length;                       // ← the bug
 * ring(count, fraction);                           // 2 points → a LINE
 * shape(axes, progress);                           // 2 points → a LINE
 * ```
 *
 * A two-vertex `<polygon>` is not a small polygon, it is a **line segment**. So
 * the moment the payload carried two axes, the background rings, the data shape,
 * the spokes and the labels all degenerated together into one thin diagonal.
 *
 * And nothing stopped that from happening. `DashboardRadar.axes` is typed
 * `DashboardRadarAxis[]` — an open array. The service *does* always send six, but
 * the type promises nothing, so a partial payload, a stale cache, a future
 * filtered endpoint or an optimistic mount with two axes resolved all render a
 * broken chart with no error anywhere. A chart whose correctness depends on an
 * invariant its own type system does not encode is a chart that will break.
 *
 * **The fix is to make the spoke count a constant and derive everything from
 * it.** `SPOKE_COUNT` is `CANONICAL_AXES.length`, and `alignAxes` projects
 * whatever arrived onto that canonical list in canonical order, back-filling any
 * missing axis as `null`. A missing axis therefore collapses to the centre —
 * exactly the "no data" reading the rest of the file has always claimed — and the
 * web stays a hexagon no matter what the payload contains.
 *
 * ## `null` is not zero, and it is drawn differently
 *
 * A missing axis sits at the centre AND is drawn as a hollow ring rather than a
 * filled dot. Drawing it as 0 would be indistinguishable from "measured, and it is
 * zero" — the one conflation this card exists to prevent. A user with no
 * reflections and a user whose reflection rate is genuinely 0 % must not produce
 * the same vertex.
 *
 * ## The grow animation *is* the draw
 *
 * The shape springs outward from the centre to its true vertices. A previous
 * version also ran a `stroke-dashoffset` draw-in over the outline using a
 * hardcoded dash length of `560`.
 *
 * That is removed rather than fixed. Two reasons: the perimeter of a hexagon at
 * this radius is ~552, so `560` was a *guess* — correct only until someone
 * changed `RADIUS`, at which point the outline silently draws short or never
 * finishes; and the grow already reads as the line drawing itself. Running both
 * is two animations competing to describe one gesture.
 *
 * The geometry is written imperatively from a `MotionValue` subscription rather
 * than through React state, so a 60 fps spring costs zero re-renders. It also
 * sidesteps a real limitation: driving an SVG `points`/`d` *attribute* from a
 * MotionValue is not reliably supported by the animation library, which is a
 * plausible second contributor to the shape never appearing.
 *
 * ## The minimum-data gate
 *
 * Below `RADAR_MIN_DAYS` scored days the card shows a faded hexagon and says so.
 * A polygon through one or two points is drawable and meaningless — it renders as
 * a confident, sharp, symmetric shape, which is the most misleading thing a chart
 * can do. The empty state is deliberately a *faded* shape rather than nothing, so
 * the user can see what they are working toward without the shape ever claiming to
 * be their data.
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { DOMAIN_ACCENT, accentRing, accentTint, type Domain } from '@/components/dashboard-ui/accent';
import { Panel, PanelEmpty } from '@/components/dashboard-ui';
import { useDashboardOverview } from '@/components/dashboard/useDashboardOverview';
import { cn } from '@/lib/utils';
import type { DashboardRadarAxis, DashboardRadarKey } from '@/types/dashboard';

const RADAR_MIN_DAYS = 3;

/**
 * The canonical axis list, and the single source of truth for geometry.
 *
 * Ordered deliberately: the first axis sits at twelve o'clock and the rest run
 * clockwise, so the labels read as a clock face rather than an arbitrary
 * ordering. Six is not arbitrary either — five spokes would put `habits` directly
 * opposite `goals` on a flat top, and an opposing pair reads as one axis rather
 * than two, so an even count is the minimum for a web where each spoke is a
 * distinct thing.
 *
 * Labels and hrefs are duplicated from the server's `RADAR_AXES` on purpose. The
 * client must be able to draw a complete web when the payload is partial, and a
 * component that cannot render without the network is a component that renders
 * wrong when the network is slow.
 */
const CANONICAL_AXES: ReadonlyArray<{
  key: DashboardRadarKey;
  label: string;
  href: string;
  domain: Domain;
}> = [
  { key: 'habits', label: 'Habits', href: '/habits', domain: 'habits' },
  { key: 'routine', label: 'Routine', href: '/routine', domain: 'routine' },
  { key: 'sleep', label: 'Sleep', href: '/wellness', domain: 'sleep' },
  { key: 'goals', label: 'Goals', href: '/goals', domain: 'goals' },
  { key: 'focus', label: 'Focus', href: '/focus', domain: 'focus' },
  { key: 'reflections', label: 'Reflections', href: '/journal', domain: 'insights' },
];

/**
 * The spoke count, from the list above — never from the payload.
 *
 * This is the fix. See the file header for why `axes.length` cannot be trusted.
 */
const SPOKE_COUNT = CANONICAL_AXES.length;

/** Degrees between adjacent spokes. */
const STEP_DEG = 360 / SPOKE_COUNT;

/** Four guide rings at the quartile marks the spec calls for. */
const RINGS = [25, 50, 75, 100] as const;

const SIZE = 260;
const CENTER = SIZE / 2;
/** Leaves room outside the outer ring for the axis labels. */
const RADIUS = 92;

/** Where the labels sit, as a percentage of the radius — outside the web. */
const LABEL_RADIUS_PCT = 128;

const fmt = (n: number) => n.toFixed(2);

/**
 * Project whatever arrived onto the canonical axis list.
 *
 * This is the guarantee. Whatever the payload contains — six axes, two axes,
 * none, an unknown key, a duplicated key — the result is exactly
 * `CANONICAL_AXES.length` entries in canonical order, with anything missing or
 * unmatched recorded as `null` so its vertex collapses to the centre.
 */
function alignAxes(incoming: readonly DashboardRadarAxis[] | undefined): DashboardRadarAxis[] {
  const byKey = new Map<DashboardRadarKey, DashboardRadarAxis>();
  for (const axis of incoming ?? []) {
    // First writer wins: a duplicated key must not make the last one override a
    // good value with a bad one.
    if (!byKey.has(axis.key)) byKey.set(axis.key, axis);
  }

  return CANONICAL_AXES.map((canonical) => {
    const found = byKey.get(canonical.key);
    const value = found?.value;

    return {
      key: canonical.key,
      // The server's own copy of the label wins when present, so a copy tweak
      // does not require a deploy of this component.
      label: found?.label ?? canonical.label,
      href: found?.href ?? canonical.href,
      // Anything non-finite is treated as absent rather than clamped, so a bad
      // number collapses the vertex instead of drawing a confident spike.
      value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    };
  });
}

/**
 * Vertex position for a spoke.
 *
 * `percent` is 0-100, matching the data and the ring marks. Spoke 0 is rotated
 * -90° so it lands at twelve o'clock rather than three.
 */
function point(index: number, percent: number): { x: number; y: number } {
  const rad = ((STEP_DEG * index - 90) * Math.PI) / 180;
  const fraction = Math.max(0, Math.min(1, percent / 100));
  const r = RADIUS * fraction;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

/**
 * A closed polygon path through every spoke at one fill level.
 *
 * Always exactly `SPOKE_COUNT` vertices and explicitly closed with `Z`, so it is a
 * filled area even at the degenerate 0 level where every vertex coincides with
 * the centre. `ringPoints` (a space-separated string, as before) is deliberately
 * not used: a 2-vertex `<polygon>` silently becomes a line, which is the entire
 * bug this file exists to prevent, so the path form is the safer primitive even
 * though it is no longer needed to avoid that case.
 */
function ringPath(percent: number): string {
  let d = '';
  for (let i = 0; i < SPOKE_COUNT; i += 1) {
    const { x, y } = point(i, percent);
    d += `${i === 0 ? 'M' : 'L'} ${fmt(x)} ${fmt(y)} `;
  }
  return `${d}Z`;
}

/**
 * The data shape at a grow-progress of 0..1.
 *
 * `null` becomes 0, which puts that vertex on the centre — the "no data" reading.
 * Progress scales every vertex from the centre outward, so 0 is a point at the
 * middle and 1 is the true shape: the user watches the area form.
 */
function dataPath(axes: readonly DashboardRadarAxis[], progress: number): string {
  let d = '';
  for (let i = 0; i < SPOKE_COUNT; i += 1) {
    const value = axes[i]?.value ?? 0;
    const { x, y } = point(i, value * progress);
    d += `${i === 0 ? 'M' : 'L'} ${fmt(x)} ${fmt(y)} `;
  }
  return `${d}Z`;
}

export function LifeBalanceRadar() {
  const { data, loading, error, reload } = useDashboardOverview();
  const radar = data?.radar ?? null;
  const reduce = useReducedMotion();

  /**
   * Always six, always in canonical order — see `alignAxes`. `count` is
   * deliberately gone from this component: nothing here may derive geometry from
   * how much data happened to arrive.
   */
  const axes = useMemo(() => alignAxes(radar?.axes), [radar]);
  const hasAnyValue = axes.some((a) => a.value !== null);
  const enough = radar !== null && radar.daysWithData >= RADAR_MIN_DAYS && hasAnyValue;

  const [hovered, setHovered] = useState<number | null>(null);

  const fillRef = useRef<SVGPathElement>(null);
  const outlineRef = useRef<SVGPathElement>(null);

  /*
    Grow from the centre on a spring.

    Under `prefers-reduced-motion` the value is SET to 1 and no animation is ever
    started — not a shortened one. The final geometry is identical either way, so
    the reduced-motion path renders exactly the same chart, just without the
    travel.
  */
  const progress = useMotionValue(0);
  useEffect(() => {
    if (reduce) {
      progress.set(1);
      return;
    }
    progress.set(0);
    const controls = animate(progress, 1, { type: 'spring', stiffness: 120, damping: 14 });
    return () => controls.stop();
  }, [progress, reduce, radar]);

  /**
   * Write the geometry imperatively.
   *
   * A spring runs ~60 frames a second; routing that through React state would
   * re-render the whole card that often. Subscribing to the MotionValue and
   * setting `d` directly costs nothing per frame, and — as noted in the header —
   * is also the only reliable way to drive an SVG path attribute from an
   * animation, since the library's own attribute support is not dependable for
   * `d`.
   */
  useEffect(() => {
    const apply = (p: number) => {
      const d = dataPath(axes, p);
      fillRef.current?.setAttribute('d', d);
      outlineRef.current?.setAttribute('d', d);
    };

    apply(progress.get());
    return progress.on('change', apply);
  }, [progress, axes]);

  const weakest = useMemo(() => {
    const present = axes.filter((a): a is DashboardRadarAxis & { value: number } => a.value !== null);
    // Three, not one: a single low axis in a seven-day window is noise, and
    // naming it a "laggard" from one bad day is a verdict on a rounding error.
    if (present.length < 3) return null;
    return present.reduce((min, a) => (a.value < min.value ? a : min));
  }, [axes]);

  const active = hovered !== null ? axes[hovered] ?? null : null;
  const activePoint =
    hovered !== null ? point(hovered, axes[hovered]?.value ?? 0) : null;

  return (
    <Panel
      title="Life balance"
      subtitle="Last 7 days"
      domain="score"
      loading={loading}
      loadingRows={3}
      minHeightClass="min-h-[19rem]"
      error={error}
      onRetry={() => void reload()}
      className="radar-surface"
      action={
        weakest && (
          <Link
            href={weakest.href}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400 motion-reduce:transition-none"
          >
            Laggard: {weakest.label}
            <span className="tabular-nums opacity-70">{weakest.value}</span>
          </Link>
        )
      }
    >
      {!enough ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 pb-5">
          {/*
            A faded hexagon rather than a confident one. Drawing the shape at full
            strength with no data behind it is how a dashboard ends up asserting a
            balance it has never measured.

            Note `ringPath(60)` — the canonical six-spoke web — not a
            `axes.length`-sized one. The empty state is the most likely place for
            the old degenerate-line bug to appear, because it is reached when
            `axes` is shortest.
          */}
          <svg width={SIZE * 0.7} height={SIZE * 0.7} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
            <path
              d={ringPath(60)}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              strokeLinejoin="round"
              opacity="0.5"
            />
          </svg>
          <PanelEmpty
            title="Not enough data yet this week"
            description={`Needs ${RADAR_MIN_DAYS} scored days before it can show a shape worth reading.`}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-5 pb-5 lg:flex-row lg:items-center">
          {/* ── the web ── */}
          <div className="relative mx-auto shrink-0">
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="overflow-visible"
              role="img"
              aria-label={
                axes
                  .map(
                    (a) =>
                      `${a.label} ${a.value === null ? 'no data' : `${a.value} out of 100`}`
                  )
                  .join(', ') || 'Life balance'
              }
            >
              <defs>
                <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="var(--radar-hue)" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="var(--radar-hue)" stopOpacity="0.18" />
                </radialGradient>
              </defs>

              {/*
                Four concentric hexagon rings at the quartile marks.

                Drawn as closed paths from the canonical spoke count. Previously
                five rings at 20-point steps, generated from `axes.length`.
              */}
              {RINGS.map((r) => (
                <path
                  key={r}
                  d={ringPath(r)}
                  fill="none"
                  stroke="var(--radar-ring)"
                  strokeWidth="1"
                  strokeLinejoin="round"
                  opacity={r === 100 ? 0.9 : 0.55}
                />
              ))}

              {/* Spokes: centre to each outer vertex, so a vertex reads as a number. */}
              {axes.map((axis, i) => {
                const { x, y } = point(i, 100);
                return (
                  <line
                    key={axis.key}
                    x1={CENTER}
                    y1={CENTER}
                    x2={x}
                    y2={y}
                    stroke="var(--radar-ring)"
                    strokeWidth="1"
                    opacity="0.7"
                  />
                );
              })}

              {/*
                The data shape: a real filled area.

                Two paths sharing one geometry — one filled, one stroked. They have
                to be separate elements because a single path cannot carry both a
                translucent gradient fill and a crisp outline without the fill
                muddying the stroke, and because the outline wants the glow while
                the fill wants none.
              */}
              <path ref={fillRef} d="" fill="url(#radar-fill)" />
              <path
                ref={outlineRef}
                d=""
                fill="none"
                stroke="var(--radar-hue)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                filter="drop-shadow(0 0 10px var(--radar-glow))"
              />

              {/* Vertex handles: a generous invisible hit area, because a 4px circle
                  is not a pointer target on a touch screen. */}
              {axes.map((axis, i) => {
                const p = point(i, axis.value ?? 0);
                const hasValue = axis.value !== null;
                const hue = DOMAIN_ACCENT[CANONICAL_AXES[i]?.domain ?? 'score'].hue;
                return (
                  <g key={axis.key}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      fill={hasValue ? hue : 'var(--radar-surface)'}
                      stroke={hasValue ? 'var(--radar-surface)' : 'var(--muted-foreground)'}
                      strokeWidth="1.5"
                      strokeDasharray={hasValue ? undefined : '2 2'}
                      className="pointer-events-none"
                    />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="14"
                      fill="transparent"
                      className="cursor-pointer outline-none"
                      tabIndex={-1}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                    >
                      <title>{`${axis.label}: ${axis.value === null ? 'no data' : `${axis.value}/100`}`}</title>
                    </circle>
                  </g>
                );
              })}

              {/* Axis labels, strictly outside the outer hexagon. */}
              {axes.map((axis, i) => {
                const p = point(i, LABEL_RADIUS_PCT);
                return (
                  <text
                    key={axis.key}
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none fill-muted-foreground text-[9px] font-medium uppercase tracking-wide"
                  >
                    {axis.label}
                  </text>
                );
              })}
            </svg>

            {/* Floating glass readout over the hovered vertex, nudged toward the
                centre so it can never leave the card. */}
            {active && activePoint && (
              <div
                role="tooltip"
                className="glass-overlay pointer-events-none absolute z-20 -translate-x-1/2 rounded-[10px] px-2.5 py-1.5 text-[11px] shadow-floating"
                style={{
                  left: Math.max(70, Math.min(SIZE - 70, activePoint.x)),
                  top: activePoint.y < CENTER ? activePoint.y - 46 : activePoint.y + 18,
                }}
              >
                <span className="font-semibold text-foreground">{active.label}</span>
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {active.value === null ? '—' : `${active.value}/100`}
                </span>
              </div>
            )}
          </div>

          {/* ── the breakdown ── */}
          <ul className="min-w-0 flex-1 space-y-0.5">
            {axes.map((axis, i) => {
              const hue = DOMAIN_ACCENT[CANONICAL_AXES[i]?.domain ?? 'score'].hue;
              return (
                <li key={axis.key}>
                  <Link
                    href={axis.href}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-[10px] px-2 py-1.5',
                      'border-b-2 transition-colors motion-reduce:transition-none',
                      'hover:bg-muted/50'
                    )}
                    style={{ borderColor: accentRing(hue, 45) }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: hue }}
                      />
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {axis.label}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[13px] font-semibold tabular-nums',
                        axis.value === null ? 'text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {axis.value === null ? '—' : axis.value}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** Kept next to the card so a future trend card cannot drift off-palette. */
export const RADAR_ACCENT = accentTint(DOMAIN_ACCENT.score.hue, 12);
