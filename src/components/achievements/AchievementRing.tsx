'use client';

/**
 * The achievement progress ring.
 *
 * ## Why this is a component and not inline SVG per badge
 *
 * The old strip inlined a `<svg viewBox="0 0 46 46">` with `r = (size - stroke) / 2`
 * inside a container of exactly `size`. That puts the stroke's outer edge at
 * exactly `size / 2` - touching the container boundary. A `strokeLinecap="round"`
 * then extends `stroke / 2` past each dash end, so at any partial progress the cap
 * at the 12 o'clock start (the circle is rotated `-90deg`) renders *outside* the
 * box and is clipped by the parent's `overflow: hidden`.
 *
 * That clipped cap is the "cyan dot at the top": it is not a stray element, it is
 * a legitimate round cap cut in half by the container edge.
 *
 * ## The fix, geometrically
 *
 * Two independent changes, both load-bearing:
 *
 *  1. **The SVG is larger than the ring.** `RING_BOX = size + stroke` and the
 *     radius is `(RING_BOX - stroke) / 2`, so the stroke's outer edge lands at
 *     `RING_BOX / 2` with a real `size / 2` margin around it. Nothing can touch
 *     the edge, at any progress value.
 *  2. **The dash is two segments, not one.** `strokeDasharray = "${C} ${C}"` means
 *     the visible dash and the gap are each exactly one circumference, so the
 *     two round caps at the seam can never overlap into a second blob.
 *
 * The same geometry is used at every size, which is what stops a 64px badge and a
 * 28px badge from looking like different components.
 */

export type RingSize = 'sm' | 'md' | 'lg';

const GEOMETRY: Record<RingSize, { size: number; stroke: number }> = {
  // Ring box, and the container it is centred in.
  sm: { size: 30, stroke: 2.5 },
  md: { size: 44, stroke: 3.5 },
  lg: { size: 56, stroke: 4 },
};

export function AchievementRing({
  percent,
  size = 'md',
  hue,
  /** Unlocked draws a complete ring and a halo; locked draws only the track. */
  complete = false,
  /** Extra delay, for the staggered draw-on. */
  index = 0,
  label,
}: {
  /** 0-100, or `null` for "not measurable" - which draws an empty track, not 0%. */
  percent: number | null;
  size?: RingSize;
  hue: string;
  complete?: boolean;
  index?: number;
  label: string;
}) {
  const { size: ring, stroke } = GEOMETRY[size];
  const box = ring + stroke;
  const r = (box - stroke) / 2;
  const centre = box / 2;
  const circumference = 2 * Math.PI * r;

  const fraction =
    complete || percent === null ? (complete ? 1 : 0) : Math.max(0, Math.min(1, percent / 100));
  const offset = circumference * (1 - fraction);

  return (
    <span
      className="relative shrink-0"
      style={{ width: box, height: box }}
      role="img"
      aria-label={label}
    >
      {/* The halo. Only on a completed ring, and only as a whisper. */}
      {complete && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-4px] rounded-full opacity-45 blur-md"
          style={{ background: `color-mix(in oklab, ${hue} 38%, transparent)` }}
        />
      )}

      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        className="block"
        aria-hidden="true"
      >
        {/* Track. Present for every state so a locked badge still reads as a ring. */}
        <circle
          cx={centre}
          cy={centre}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
          opacity={0.75}
        />

        {fraction > 0 && (
          <circle
            cx={centre}
            cy={centre}
            r={r}
            fill="none"
            stroke={hue}
            strokeWidth={stroke}
            strokeLinecap="round"
            // Two segments of one circumference each: the seam is exact, so the
            // round caps meet cleanly instead of overlapping into a blob.
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${centre} ${centre})`}
            className="ring-draw"
            style={{
              ['--ring-c' as string]: circumference.toFixed(3),
              ['--ring-offset' as string]: offset.toFixed(3),
              // A5: "staggered 80ms per ring if multiple."
              ['--ring-delay' as string]: `${index * 80}ms`,
            }}
          />
        )}
      </svg>
    </span>
  );
}
