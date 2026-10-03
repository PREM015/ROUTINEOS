'use client';

/**
 * `/dashboard` design system — barrel.
 *
 * One folder, one purpose: the primitives and tokens that make the dashboard
 * look designed rather than assembled from widgets.
 *
 * ```
 * accent.ts        the eight domain hues (identity, not state)
 * tokens.ts        semantic tokens: status, health, tier, heat ramp, radius, motion
 * Panel.tsx        the card surface + its four states
 * RadialGauge.tsx  the ring, implemented once and correctly
 * primitives.tsx   Tag, PanelEmpty
 * layout.tsx       the adaptive main grid
 * ```
 *
 * `MetricCard` was removed with the metrics row it existed to unify: it was the
 * shared "icon -> number -> ring -> line" anatomy for the four cards that
 * duplicated `/today`. With those gone the anatomy had no consumer, and leaving
 * an exported card component behind invites the next person to reintroduce the
 * duplicate-card pattern it was built for.
 *
 * Kept separate from `src/components/today/ui.tsx` on purpose. That file's
 * header says it is "sealed to this page", yet `TodayDayType` — which the
 * dashboard also renders — already imports `GlassPanel` from it. Two pages
 * importing from a module documented as private is how that happened.
 *
 * Import from the barrel (`@/components/dashboard-ui`) rather than the
 * individual files, so the split can change without touching every call site.
 */

export { Panel, PanelHeader, PanelSkeletonLine } from './Panel';
export { RadialGauge } from './RadialGauge';
export { Tag, PanelEmpty } from './primitives';
export { AdaptiveColumns } from './layout';
export type { PanelProps } from './Panel';

export {
  DOMAIN_ACCENT,
  accentTint,
  accentRing,
  type Domain,
} from './accent';

export {
  STATUS,
  statusTint,
  HEALTH_META,
  TIER_DOT,
  HEAT_RAMP,
  HEAT_FILL,
  HEAT_EDGE,
  heatLevel,
  PRIORITY_TONE,
  RADIUS,
  ELEVATION,
  MOTION,
  EMPTY_COPY,
  type StatusKey,
  type HealthKey,
} from './tokens';
