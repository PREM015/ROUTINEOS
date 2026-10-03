import type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  DayType,
  RoutineLogStatus,
  Category,
} from '@/generated/prisma';

export type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  DayType,
  RoutineLogStatus,
  Category,
};

/**
 * Routine Management Types
 * Complete type system for daily routine management
 */

// ============================================================================
// Core Routine Types
// ============================================================================

export interface RoutineTemplateWithBlocks extends RoutineTemplate {
  blocks: RoutineBlockWithCategory[];
  exceptions: RoutineException[];
  /**
   * The day-type preset this template is linked to, when it has one.
   *
   * Optional because not every load path selects it: `findAllTemplates` does, but
   * the service also reads templates through paths that do not. Callers must treat
   * its absence as "this template has no linked preset" rather than assume it is
   * loaded — a name read off it has to have a fallback.
   */
  dayTypeDef?: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
  } | null;
  _count?: {
    blocks: number;
    exceptions: number;
  };
}

export interface RoutineBlockWithCategory extends RoutineBlock {
  category: Category | null;
}

export interface RoutineLogWithDetails extends RoutineLog {
  template: RoutineTemplate | null;
  block: RoutineBlock | null;
}

// ============================================================================
// Routine State & Query Types
// ============================================================================

export interface RoutineFilterOptions {
  dayType?: DayType;
  isActive?: boolean;
  isDefault?: boolean;
  search?: string;
  sortBy?: 'name' | 'dayType' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * A routine block's writable fields.
 *
 * `type` and `isFlex` used to be declared here and were **required** by
 * `RoutineBlockCreateInput`, but neither is a column on `RoutineBlock`. That
 * mismatch propagated: `POST /api/routine/[id]/blocks` demanded a `type` of
 * `WORK | REST | LEARNING | EXERCISE | ROUTINE | FLEX`, then destructured it out
 * of the parsed body and threw it away before the insert. A caller was told its
 * request was validated while the field was silently discarded.
 *
 * They are gone rather than made optional, because an optional field the server
 * ignores is still a lie in the schema.
 */
export interface RoutineBlockCreateInput {
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  categoryId?: string | null;
  color?: string | null;
  icon?: string | null;
  notes?: string | null;
  energyLevel?: string | null;
  trackCompletion?: boolean;
  isRecurring?: boolean;
  sortOrder?: number;
}

export interface RoutineBlockUpdateInput {
  title?: string;
  description?: string | null;
  startTime?: string;
  endTime?: string;
  categoryId?: string | null;
}

export interface RoutineTemplateCreateInput {
  name: string;
  dayType: DayType;
  isDefault?: boolean;
  blocks?: RoutineBlockCreateInput[];
}

export interface RoutineTemplateUpdateInput {
  name?: string;
  dayType?: DayType;
  isDefault?: boolean;
  isActive?: boolean;
}

// ============================================================================
// Routine Resolution & Conflict Types
// ============================================================================

/**
 * The log fields the routine UI reads.
 *
 * The server sends a complete `RoutineLog` row, but the store also builds an
 * *optimistic* log client-side before any routine-log endpoint exists. That
 * optimistic object only carries user-editable fields, so it is not a full
 * `RoutineLog`. This interface is the intersection both satisfy — a full
 * `RoutineLog` is assignable to it, and so is the client's partial object.
 */
export interface ResolvedBlockLog {
  id: string;
  status: RoutineLogStatus;
  actualStartTime: string | null;
  actualEndTime: string | null;
  durationMinutes: number | null;
  focusRating: number | null;
  productivityRating: number | null;
  energyLevel: number | null;
  note: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * How this block has been going lately, aggregated from the ratings already in
 * `RoutineLog`.
 *
 * Read-side only. `CompletionSheet` has written these three columns since it
 * shipped and nothing read them back, so this turns data the user was already
 * giving us into something they can see.
 *
 * ## Nulls mean "not measured", not zero
 *
 * Every field is nullable and a block with no rated logs has no insight at all
 * (`insight === null` on the block) rather than an insight full of zeros. A
 * user who has never rated focus has not scored zero focus, and rendering "avg
 * focus 0.0/5" would be the single most damaging thing this card could say.
 *
 * `samples` is how many log rows contributed, so the average can be presented
 * honestly: an average of one is not a trend, and the UI says so.
 */
export interface BlockInsight {
  /** Rated log rows behind these averages, most recent first. */
  samples: number;
  /** 1–5, one decimal, or null when no row rated it. */
  averageFocus: number | null;
  averageProductivity: number | null;
  /** 1–5, from `RoutineLog.energyLevel` — not `RoutineBlock.energyLevel`. */
  averageEnergy: number | null;
  /** The most recent rated log's date, `YYYY-MM-DD`. */
  lastRatedDate: string | null;
}

export interface ResolvedRoutineBlock {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string | null;
  notes: string | null;
  color: string | null;
  icon: string | null;
  /** Projected category — the resolver flattens the relation. */
  category: {
    id: string;
    name: string;
    color: string | null;
    icon?: string | null;
  } | null;
  /** Raw FK, so an editor can send a `null` to clear the category. */
  categoryId: string | null;
  /** `HIGH` / `MEDIUM` / `LOW`, free-text in the schema so nullable string. */
  energyLevel: string | null;
  trackCompletion: boolean;
  isRecurring?: boolean;
  /** Tiebreak only. The timeline orders by `startTime`, not by this. */
  sortOrder?: number;
  /** Derived from `startTime`/`endTime`; handles blocks crossing midnight. */
  durationMinutes: number;
  /** True when the block's end time is at or before its start time. */
  isOvernight: boolean;
  /** The user's log for this block on the resolved date, if any. */
  log: ResolvedBlockLog | null;
  /**
   * Rating history for this block across recent dates, or `null` when the user
   * has never rated it. Read-side aggregation over `RoutineLog`; see
   * {@link BlockInsight}.
   */
  insight?: BlockInsight | null;
}

/**
 * The day's stored score, as far as a schedule cares.
 *
 * Included in `ResolvedDailyRoutine` so the routine page needs one request
 * rather than two: `isRestDay` is a real state of the day (the blocks still
 * render, the page reframes them) and it lives on `DailyScore`, not on the
 * routine models at all.
 */
export interface ResolvedDayScore {
  /**
   * `DailyScore.routineCompletionRate`.
   *
   * **Not** the same number as `ResolvedDailyRoutine.completionRate`, and never
   * will be: this divides completed by the number of log *rows* that exist,
   * which excludes every block nobody has touched. See the note on
   * `completionRate` below.
   */
  routineCompletionRate: number;
  habitCompletionRate: number | null;
  totalScore: number | null;
  /**
   * The sleep component of the day's score, or `null` when no sleep was logged.
   *
   * Distinct from `totalScore: null`, which means no score row exists at all.
   */
  sleepScore?: number | null;
  /**
   * The raw `DailyScore.calculationData` payload, when one was stored.
   *
   * `null` rather than `{}` when absent: an empty object would read as "computed
   * and found nothing", which is a different claim from "never computed".
   */
  calculationData: unknown | null;
  overallGrade: string | null;
  isRestDay?: boolean;
  restDayReason?: string | null;
  isMinimumDay?: boolean;
  minimumDayReason?: string | null;
}

export interface ResolvedDailyRoutine {
  date: string;
  dayType: DayType;
  template: RoutineTemplate | null;
  exception: RoutineException | null;
  blocks: ResolvedRoutineBlock[];
  /**
   * completed / every block, day-type filtered.
   *
   * Deliberately **not** restricted to `trackCompletion` blocks, because
   * `/today` renders this and changing the denominator would silently move its
   * headline number. The routine page computes its own tracked-only rate from
   * `blocks[].trackCompletion` for exactly that reason.
   */
  totalBlocks: number;
  completedBlocks: number;
  completionRate: number;
  /**
   * Completed blocks that belong to a schedule this date no longer resolves to.
   *
   * A `RoutineLog` records only its `routineBlockId`, so changing the date's day
   * type afterwards orphans the work: the day resolves a different template's
   * blocks and the completion disappears from every count. These are returned
   * rather than dropped so the UI can say *"completed under College Day, which is
   * no longer this date's schedule"* instead of the user believing their work was
   * deleted.
   *
   * Empty on an ordinary day. When non-empty, `totalBlocks` and `completionRate`
   * are measured against the off-schedule template rather than the resolved one.
   */
  offScheduleLogs?: Array<{
    blockId: string;
    title: string;
    templateId: string;
    templateName: string | null;
    completed: number;
  }>;
  /** The `DayTypeDefinition` this date resolves to, when there is one. */
  dayTypeId: string | null;
  /** Display name for `dayTypeId`, falling back to the template's name. */
  dayTypeName: string | null;
  /** Whether the day type came from an override or from the weekday rule. */
  dayTypeSource: 'NATURAL' | 'EXCEPTION';
  /**
   * `null` when there is no template at all.
   *
   * `false` means a template exists but is inactive, which is a different
   * state from "no template" — `/today` resolves through
   * `findTemplateByDayTypeId`, which filters `isActive: true`, so an inactive
   * template's blocks exist and are simply never shown there.
   */
  templateIsActive: boolean | null;
  score: ResolvedDayScore;
}

/**
 * Per-template routine analytics for a date range, as returned by
 * `RoutineService.getRoutineAnalytics`. Rates are `null` rather than `0` when
 * there is nothing to divide by, so "no data" is distinguishable from
 * "0% completion".
 */
export interface RoutineAnalytics {
  templateId: string;
  templateName: string;
  period: { startDate: string; endDate: string };
  totalBlocks: number;
  trackedBlocks: number;
  completion: {
    totalLogs: number;
    completedLogs: number;
    partialLogs: number;
    missedLogs: number;
    completionRate: number | null;
  };
  blocks: Array<{
    id: string;
    title: string;
    tracked: boolean;
    duration: number;
    logCount: number;
    completionRate: number | null;
  }>;
}

export interface RoutineConflict {
  type: 'OVERLAP' | 'INVALID_TIME' | 'DUPLICATE';
  message: string;
  blockId1?: string;
  blockId2?: string;
  startTime?: string;
  endTime?: string;
}

// ============================================================================
// Routine Log & Tracking Types
// ============================================================================

export interface RoutineLogInput {
  templateId?: string;
  blockId?: string;
  date: string;
  status: RoutineLogStatus;
  notes?: string;
}

// ============================================================================
// Routine Progress (dashboard widget)
// ============================================================================

export type RoutineProgressPeriod = 'day' | 'week' | 'month' | 'year';

export interface RoutineProgressBlock {
  blockId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: RoutineLogStatus | null;
  /**
   * Whether the user asked to have this block tracked.
   *
   * Present so the consumer can distinguish "not done" from "not something you
   * were tracking", which is the same distinction the habit heatmap draws as
   * `NO_RECORD` rather than as a zero.
   */
  trackCompletion: boolean;
}

export interface RoutineProgressDay {
  date: string;
  dayType: DayType;
  /**
   * The resolved day type's own name.
   *
   * `dayType` is the six-value enum, which collapses every user-defined preset
   * to `CUSTOM` (see `day-type-identity.ts`). A week strip or a per-preset
   * comparison that rendered the enum would show several identical "Custom"
   * rows, so the definition's real name travels alongside it and this is a
   * display label only — never a join key.
   */
  dayTypeName: string;
  /** The day type's colour, or `null` when it has none. */
  dayTypeColor: string | null;
  /** A template with at least one block resolved for this date. */
  scheduled: boolean;
  /**
   * Tracked blocks — the denominator the `/routine` day view uses.
   *
   * **These are tracked-only, not every block.** The service used to divide by
   * `template.blocks.length`, which silently produced a *third* completion
   * definition alongside the day view's tracked rate and the score's log-row
   * rate. It now filters on `trackCompletion` so a number shown here and a
   * number shown on the day view for the same date are the same measurement.
   */
  total: number;
  /** Tracked blocks with a `COMPLETED` log. */
  completed: number;
  /** `round(completed / total * 100)`, or 0 when nothing is tracked. */
  completionRate: number;
  /**
   * `total` and `completed` are measured against a **different template** than the
   * one this date currently resolves to.
   *
   * This happens when the day's logs name a schedule other than the resolved one —
   * typically because the day type was changed after the work was logged. Before
   * this flag existed the service silently reported `0` completed for such a day,
   * which is how four real completions rendered as 0%. The rate is not wrong here;
   * it is measured against the template the user was actually following, and this
   * flag is what lets the UI say so rather than quietly disagree with the day view.
   */
  scheduleSwitched?: boolean;
  blocks: RoutineProgressBlock[];
}

export interface RoutineProgressMonth {
  month: string; // YYYY-MM
  scheduledDays: number;
  averageCompletionRate: number;
}

export interface RoutineProgressResponse {
  period: RoutineProgressPeriod;
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  days: RoutineProgressDay[];
  months: RoutineProgressMonth[];
}

// ============================================================================
// Day overrides
// ============================================================================

/**
 * One date where the routine was deliberately set to something other than the
 * natural weekday rule.
 *
 * Narrowed at the route from the `RoutineException` row on purpose. The raw
 * payload carries a whole `RoutineTemplate` and a whole `DayTypeDefinition` per
 * row, neither of which the list renders, and both of which would grow if a
 * template ever gained relations. `dayTypeName` / `dayTypeColor` are resolved
 * here so the client never has to join against a definition list it may not
 * have loaded.
 *
 * **This is day-type overrides only.** `DayModeService` writes a
 * `RoutineException` for `DAY_TYPE` mode alone; `REST` and `MINIMUM` set
 * `isRestDay` / `isMinimumDay` on the `DailyScore` row and leave no exception
 * behind, and `CLEAR` deletes it. A rest day is therefore correctly absent from
 * this list — it has a home on the day view (`RestDayBanner`), not here.
 */
export interface DayOverride {
  date: string;
  dayTypeName: string;
  dayTypeColor: string | null;
  note: string | null;
}

// ============================================================================
// Helper Functions / Guards
// ============================================================================

export function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

// ============================================================================
// Day Type Definitions
// ============================================================================

/**
 * A user-defined day type.
 *
 * Canonical definition — this replaces four hand-rolled copies of the same
 * interface (routine/page.tsx, habits/page.tsx, AddHabitModal.tsx,
 * EditHabitModal.tsx), which had already drifted: only one of them declared the
 * optional `_count` block. Derived from the Prisma model so a schema change
 * surfaces here rather than in four places.
 */
export interface DayTypeDefinition {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
  /** Present only when the query includes a relation count; all keys then exist. */
  _count?: {
    routineTemplates: number;
    routineExceptions: number;
    habitAssignments: number;
    goalAssignments: number;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * A `DayTypeDefinition` projected for a `<select>`: the enum value it maps to
 * plus its display fields. Shared by the routine page and the routine-block
 * modal, which previously each declared their own structurally-different copy.
 */
export interface DayTypeOption {
  value: DayType;
  label: string;
  /** Nullable to match `DayTypeDefinition`; absent for the static defaults. */
  color?: string | null;
  icon?: string | null;
  dayTypeId?: string;
}

export type RoutineTemplatesByDayType = Record<DayType, RoutineTemplateWithBlocks[]>;

export type DayTypeLabels = Record<DayType, string>;

export type DayRoutine = ResolvedDailyRoutine;
export type DayRoutineBlock = ResolvedRoutineBlock;
export type CreateRoutineTemplateInput = RoutineTemplateCreateInput;
export type CreateRoutineBlockInput = RoutineBlockCreateInput;
