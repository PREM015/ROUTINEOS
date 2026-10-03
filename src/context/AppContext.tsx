'use client';

import { createContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { fetchWithAuth } from '@/lib/api-client';
import { nowForUser } from '@/lib/dates';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { apiErrorMessage } from '@/lib/api-client';
import { addDays } from '@/lib/goals/goal-metrics';

/**
 * Update payload accepted by `updateHabit` / `updateGoal`.
 *
 * Shaped like `Partial<Habit>` / `Partial<Goal>` so the optimistic local write
 * stays type-safe against the client models, but the fields backed by a nullable
 * Prisma column accept `null` as well as `undefined`. Sending `undefined` to
 * mean "clear this" does nothing — `JSON.stringify` drops undefined keys, so the
 * request never carried them and the old value survived. That is why the Edit
 * modals could not empty a description, a colour, `frequencyValue`,
 * `targetCount` or `reminderTime`.
 */
type UpdateHabitPatch = Omit<
  Partial<Habit>,
  | 'description'
  | 'color'
  | 'icon'
  | 'frequencyValue'
  | 'targetCount'
  | 'reminderTime'
  | 'endDate'
  | 'categoryId'
> & {
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  frequencyValue?: string | null;
  targetCount?: number | null;
  reminderTime?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  appliesEveryDay?: boolean;
  dayTypeIds?: string[];
};

type UpdateGoalPatch = Omit<Partial<Goal>, 'description' | 'unit'> & {
  description?: string | null;
  unit?: string | null;
};

/**
 * What a client may ask for when creating a goal.
 *
 * Mirrors `CreateGoalInput` in `@/types/goal` but with **calendar-label dates**
 * (`yyyy-mm-dd`) instead of `Date`. The client model already speaks in labels
 * everywhere — `Goal.startDate` is a string, because `normalizeGoal` truncates
 * the server's serialised `Date` — so accepting `Date` here would mean every
 * caller converts a label back into an instant only for it to be re-truncated on
 * the way in.
 *
 * All seven fields the old allow-list dropped are present, so `addGoal` can
 * forward the request whole.
 */
export interface CreateGoalRequest {
  title: string;
  description?: string | null;
  type: Goal['type'];
  priority?: Goal['priority'];
  targetValue: number;
  currentValue?: number;
  unit?: string | null;
  /** `yyyy-mm-dd`. Omit for a goal that starts now. */
  startDate?: string;
  /** `yyyy-mm-dd`. Omit to take the service's `startDate + 365d` default. */
  endDate?: string;
  projectId?: string;
  parentGoalId?: string;
  isPublic?: boolean;
  tagIds?: string[];
  milestones?: Array<{
    title: string;
    description?: string;
    targetValue?: number;
    /** `yyyy-mm-dd`. */
    dueDate?: string;
  }>;
  appliesEveryDay?: boolean;
  dayTypeIds?: string[];
}

// ─── Types (aligned with Prisma enums + API Zod schemas) ────────────────────

export type HabitTier =
  | 'NON_NEGOTIABLE' | 'GROWTH' | 'BONUS' | 'OPTIONAL' | 'EXPERIMENTAL' | 'UNDEFINED'
  | 'ALTERNATIVE' | 'SPECIAL' | 'FLEXIBLE' | 'JUST_FOR_FUN' | 'LIFESTYLE';
export type HabitStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'COMPLETED';
export type FrequencyType =
  | 'DAILY' | 'SPECIFIC_WEEKDAYS' | 'WEEKLY_TARGET' | 'MONTHLY_TARGET'
  | 'YEARLY_TARGET' | 'RANDOM' | 'ONE_TIME' | 'CUSTOM';
export type LogStatus = 'COMPLETED' | 'MISSED' | 'SKIPPED' | 'NOT_APPLICABLE' | 'PARTIAL';

/**
 * How the day actually went / how much load it carried.
 *
 * This is NOT a routine `DayType` (WORKDAY/WEEKEND/...). It was previously named
 * `DayType` in this file, which collided with the Prisma enum and created a
 * sixth day-type taxonomy in circulation. The routine day type is the `DayType`
 * imported from `@/generated/prisma` above.
 */
export type DayMode = 'NORMAL' | 'MINIMUM' | 'REST' | 'MISSED';

export interface Habit {
  id: string;
  name: string;
  /** Nullable because the Prisma column is nullable — an emptied field clears
   *  it rather than falling back to `undefined`. */
  description?: string | null;
  tier: HabitTier;
  status: HabitStatus;
  categoryId?: string | null;
  category?: string;
  color?: string | null;
  icon?: string | null;
  frequencyType: FrequencyType;
  frequencyValue?: string | null;
  targetCount?: number | null;
  startDate: string;
  endDate?: string | null;
  reminderTime?: string | null;
  reminderEnabled?: boolean;
  appliesEveryDay?: boolean;
  /**
   * The nested `dayType` object is included by the habit repository and is
   * present at runtime, but this type only declared `dayTypeId`. That is enough
   * to *filter* by assignment and not enough to *show* which day types a habit
   * belongs to — so the /habits card had no way to explain why a habit is not on
   * today's list. The relation is declared here so consumers can read the label.
   */
  dayTypeAssignments?: Array<{
    dayTypeId: string;
    dayType?: { id: string; name: string; slug: string; icon?: string | null; color?: string | null } | null;
  }>;
  /**
   * The habit's tags, as the `HabitTag` join rows the repository returns.
   *
   * Declared because the whole tagging feature is otherwise unreachable from
   * the client: `HabitRepository.findAll` and `findWithRelations` both include
   * `tags: { include: { tag: true } }`, `HabitService.createHabit` and
   * `updateHabit` already honour `tagIds`, `habitQuerySchema` already accepts
   * `tagId` — and no client type, no modal control and no row rendering used any
   * of it. Without this field a tag assigned through the API was discarded the
   * moment the response reached `normalizeHabit`.
   */
  tags?: Array<{
    tagId: string;
    tag?: { id: string; name: string; color?: string | null; icon?: string | null } | null;
  }>;
  streakCount?: number;
  longestStreak?: number;
  /**
   * `Habit.estimatedDuration` (minutes) and `Habit.difficulty` (1-5).
   *
   * Both exist on the model and both are writable through
   * `updateHabitSchema`, but the client type never declared them, so anything
   * that read them failed to compile and the row could not show them. Declared
   * here so the card can surface the estimate the user actually entered.
   */
  estimatedDuration?: number | null;
  difficulty?: number | null;
}

/**
 * The un-normalised habit shape, i.e. what the API actually sends.
 *
 * Named rather than written inline in `normalizeHabit` so the paginated fetch
 * can type its parsed payload. `json.data` is `any`, so without this the
 * `batch.map(normalizeHabit)` call either needs an `any` cast (which would let
 * a shape change through silently) or fails, since `any[]` does not match
 * `RawHabit[]`.
 *
 * Note that the repository sends dates as `Date`, and Prisma serialises those to
 * ISO strings, so `string | Date` covers both the serialised and the in-process
 * case. `normalizeHabit` truncates them to `yyyy-MM-dd` on the way in, which is
 * why consumers treat them as calendar dates and never re-parse them as
 * instants.
 */
type RawHabit = {
  id: string;
  name: string;
  description?: string | null;
  tier?: HabitTier;
  status?: HabitStatus;
  categoryId?: string | null;
  category?: string | { name?: string } | null;
  color?: string | null;
  icon?: string | null;
  frequencyType?: FrequencyType;
  frequencyValue?: string | null;
  targetCount?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  reminderTime?: string | null;
  reminderEnabled?: boolean | null;
  appliesEveryDay?: boolean | null;
  dayTypeAssignments?: Habit['dayTypeAssignments'] | null;
  tags?: Habit['tags'] | null;
  streakCount?: number | null;
  longestStreak?: number | null;
  estimatedDuration?: number | null;
  difficulty?: number | null;
};

/**
 * A `Goal` row as `GET /api/goals` returns it, before normalisation.
 *
 * `findAll` already selects the `project` relation, the `dayTypeAssignments` with
 * their day type, tags and milestone counts — all of it was being fetched on
 * every page load and then discarded by `normalizeGoal`, which is why the page
 * had no project chip or day-type scope to show even though the data was right
 * there in the payload.
 */
type RawGoal = {
  id: string;
  type?: Goal['type'];
  priority?: Goal['priority'];
  status?: Goal['status'];
  title: string;
  description?: string | null;
  targetValue?: number | string | null;
  currentValue?: number | string | null;
  unit?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  carriedOverFrom?: string | null;
  appliesEveryDay?: boolean | null;
  project?: GoalProjectRef | null;
  dayTypeAssignments?: Array<{ dayType?: { name?: string | null } | null }> | null;
  /**
   * Ids and completion flags only — this is exactly what the list route's
   * `milestones` select returns. It is here so the counts can be derived in the
   * normalizer without a second request per goal.
   */
  milestones?: Array<{ id?: string; completedAt?: string | Date | null }> | null;
  /** Parent goal, by id and title only — enough to link back, not to render. */
  parentGoal?: { id: string; title: string } | null;
  /** Children, id/title/status/progress only. Capped at 12 server-side. */
  subGoals?: Array<{
    id: string;
    title: string;
    status: string;
    currentValue?: number | string | null;
    targetValue?: number | string | null;
  }> | null;
  /** Total children, so a capped `subGoals` array can say "12 of 20". */
  subGoalCount?: number | null;
};

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  status: LogStatus;
  completedAt?: string;
  note?: string;
}

/**
 * A routine block, as this context used to publish it.
 *
 * Retired. `/routine` now owns its data through `useRoutineDay`, which reads the
 * per-date resolved schedule from `GET /api/routine/today`. This shape existed to
 * flatten `GET /api/routine` — every template, every day type — into one flat
 * list, and it is why the page had two sources of block identity that disagreed:
 * this one keyed blocks by the `DayType` enum (where every custom day type is
 * `CUSTOM`), and the resolver keyed them by template.
 *
 * Kept only as an export so an out-of-tree reference still resolves. Nothing in
 * `src/` imports it.
 *
 * @deprecated Use `ResolvedRoutineBlock` from `@/types/routine`.
 */
export interface RoutineBlock {
  id: string;
  dayType: string;
  dayTypeId?: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  trackCompletion: boolean;
  overlapWarning?: boolean;
  energyLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  templateId?: string;
}

/** The `project` relation `GET /api/goals` already selects alongside each goal. */
export interface GoalProjectRef {
  id: string;
  name: string;
  color?: string | null;
}

export interface Goal {
  id: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
  // `Goal.priority` is `GoalPriority @default(MEDIUM)` — non-nullable in the
  // database, so the client model must not claim otherwise.
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'PERSONAL' | 'ACADEMIC' | 'NON_PROFIT' | 'PROFESSIONAL';
  status: 'ACTIVE' | 'COMPLETED' | 'MISSED' | 'CARRIED_OVER' | 'ON_HOLD' | 'CANCELLED';
  title: string;
  description?: string | null;
  targetValue: number;
  currentValue: number;
  unit?: string | null;
  startDate: string;
  endDate: string;
  carriedOverFrom?: string;
  /**
   * `appliesEveryDay` and the day-type assignments were always in the API
   * response and always loaded — the client model just threw them away, which
   * is why a goal scoped to "Workdays" rendered on `/goals` identically to one
   * that applies every day, and disagreed with `/today` about whether it applied.
   */
  appliesEveryDay: boolean;
  /** Day-type names this goal is scoped to. Empty when `appliesEveryDay`. */
  dayTypeNames: string[];
  /** Owning project, when the goal has one. */
  project?: GoalProjectRef | null;
  /**
   * How many milestones the goal has, and how many are done.
   *
   * Count only, deliberately. The list payload selects `{ id, completedAt }` per
   * goal and stops there; the drawer fetches the rows themselves when it opens.
   * Carrying twelve goals' worth of milestone titles in the list response would
   * make the common page load pay for detail only one goal's drawer can show.
   */
  milestoneCount: number;
  milestoneDoneCount: number;
  /** Parent goal id, when this goal is a sub-goal. */
  parentGoalId?: string;
  /** Parent goal title, so the hierarchy is legible without a fetch. */
  parentGoalTitle?: string;
  /**
   * Direct children, id/title/status/progress only.
   *
   * Capped at 12 by the list query's `take`; {@link subGoalCount} is the true
   * total, so the UI can say "12 of 20" instead of implying the list is complete.
   */
  subGoals: Array<{
    id: string;
    title: string;
    status: string;
    currentValue: number;
    targetValue: number;
  }>;
  /** Total children, from `_count.subGoals`. */
  subGoalCount: number;
}
export interface DayMeta {
  date: string;
  /** Day *mode* (NORMAL/MINIMUM/REST/MISSED) — not the routine `DayType`. */
  mode: DayMode;
  contextTags: string[];
  minimumDayReason?: string;
  restDayReason?: string;
  energy?: number;
  mood?: number;
  reflectionText?: string;
  biggestWin?: string;
  biggestDifficulty?: string;
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppContextValue {
  // Habits
  habits: Habit[];
  habitLogs: HabitLog[];
  dataLoaded: boolean;
  dataError: string | null;
  reloadData: () => Promise<void>;
  addHabit: (habit: Omit<Habit, 'id'> & { tagIds?: string[]; appliesEveryDay?: boolean; dayTypeIds?: string[] }) => Promise<Habit>;
  /**
   * Patch a habit.
   *
   * The update payload is `UpdateHabitInput`-shaped rather than
   * `Partial<Habit>` so callers can send `null` to *clear* a nullable column.
   * `Partial<Habit>` forbade null, which is why the Edit modal used to send
   * `undefined` (dropped by `JSON.stringify`) and four fields could never be
   * emptied.
   */
  updateHabit: (id: string, updates: UpdateHabitPatch) => Promise<void>;
  /**
   * Archive a habit.
   *
   * Uses the dedicated `POST /api/habits/{id}/archive` endpoint rather than a
   * PATCH with `status: 'ARCHIVED'`. A PATCH only writes the enum: it leaves
   * `archivedAt` null and writes no audit row, so "Archived on <date>" was
   * permanently unanswerable and the archive left no trace in the audit log.
   */
  archiveHabit: (id: string) => Promise<void>;
  restoreHabit: (id: string) => Promise<void>;
  /**
   * Pause / resume via `POST /api/habits/{id}/pause` and `/resume`.
   *
   * Not a PATCH with `status`: `resumeHabit` deletes the habit's `PAUSE`
   * overrides, so a PATCH left a pause marker in place on an `ACTIVE` habit and
   * the service then refused every completion for it ("paused until ...").
   */
  pauseHabit: (id: string, reason?: string) => Promise<void>;
  resumeHabit: (id: string) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  logHabit: (habitId: string, date: string, status: LogStatus, note?: string) => Promise<void>;
  getLogForDate: (habitId: string, date: string) => HabitLog | undefined;

  // Routine: intentionally absent.
  //
  // There is no routine slice in this context any more. It published a flattened
  // `GET /api/routine` payload that no page read after `/routine` moved to
  // `useRoutineDay`, and carrying it meant every dashboard page fetched a payload
  // it discarded. `/routine` owns its own single request instead.

  // Goals
  goals: Goal[];
  addGoal: (goal: CreateGoalRequest) => Promise<Goal>;
  /** Patch a goal. `UpdateGoalPatch` allows `null` so fields can be cleared. */
  updateGoal: (id: string, updates: UpdateGoalPatch) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  updateGoalProgress: (id: string, value: number, note?: string) => Promise<void>;

  // Day meta
  dayMeta: Record<string, DayMeta>;
  setDayMeta: (date: string, meta: Partial<DayMeta>) => void;
  getDayMeta: (date: string) => DayMeta;

  // UI state
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  /**
   * The routine day type the user is looking at, keyed by **`DayTypeDefinition.id`**.
   *
   * This used to be a `DayType` enum value, which is a *classification*, not an
   * identity: every user-defined day type ("College Day", "Exam Day", …)
   * classifies as `CUSTOM`, so any number of them shared one key. Selecting a
   * different custom day type therefore changed nothing observable - the same
   * blocks stayed on screen and the two day types were indistinguishable.
   *
   * `null` means "no explicit choice": the page falls back to the day type this
   * date actually resolves to. That is a different thing from an enum sentinel
   * such as `'CUSTOM'`, which is a real classification and would pin the view to
   * a specific day type forever.
   *
   * Canonical fallback tabs (used only when the account has no
   * `DayTypeDefinition` rows at all) have no id, and are keyed by their enum
   * value instead — see `routineTabKey`.
   */
  selectedRoutineDayTypeId: string | null;
  setSelectedRoutineDayTypeId: (dayTypeId: string | null) => void;
  undoStack: (() => void)[];
  pushUndo: (fn: () => void) => void;
  undo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/** @internal Shared by the provider and `useApp`. */
export { AppContext };

let idCounter = 1;
const genId = () => `local-${Date.now()}-${idCounter++}`;

async function throwIfNotOk(response: Response, fallback: string): Promise<unknown> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(json, fallback));
  return json;
}

// Module-level in-flight guard: one data layer, deduped initial fetch.
let inflightFetch: Promise<void> | null = null;

/** Habits per request when paging the list route. */
const HABIT_FETCH_PAGE = 100;

/**
 * Ceiling on the whole paginated habit fetch.
 *
 * Exists purely as a runaway guard: the list route returns no total count, so the
 * loop can only stop on a short page. A server that kept answering with full
 * pages would otherwise loop forever, and a slow one would keep this request
 * chain open indefinitely.
 */
const HABIT_FETCH_MAX = 1000;

/** Goals per request when paging the list route. */
const GOAL_FETCH_PAGE = 100;

/**
 * Ceiling on the whole paginated goal fetch.
 *
 * Same runaway guard as habits: `GET /api/goals` clamps `limit` at 100 inside
 * `BaseRepository.buildPaginationQuery`, so a request for more than that comes
 * back full no matter what was asked for. The loop therefore terminates on the
 * authoritative `meta.total`, with a short page as the fallback.
 */
const GOAL_FETCH_MAX = 1000;

export function AppProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  // The user's timezone drives "today". It previously called `getTodayString()`
  // with no argument, which silently resolved to a hard-coded Asia/Kolkata
  // default, so every habit/routine/goal widget was anchored to the IST date —
  // a day ahead for the 5.5 hours a western user's local day runs ahead of IST.
  const { timezone: userTimezone, today: userToday } = useUserTimezone();
  // Avoid hydration mismatch: render a stable placeholder, set the real
  // local date after mount.
  const [selectedDate, setSelectedDate] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only date sync to avoid SSR hydration mismatch
    setSelectedDate((d) => d || userToday);
  }, [userToday]);
  const today = selectedDate || '1970-01-01';

  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dayMeta, setDayMetaMap] = useState<Record<string, DayMeta>>({});
  const [selectedRoutineDayTypeId, setSelectedRoutineDayTypeId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<(() => void)[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const normalizeHabit = useCallback((raw: RawHabit): Habit => ({
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    tier: raw.tier ?? 'GROWTH',
    status: raw.status ?? 'ACTIVE',
    categoryId: raw.categoryId ?? undefined,
    category: typeof raw.category === 'string' ? raw.category : (raw.category?.name ?? undefined),
    color: raw.color ?? undefined,
    icon: raw.icon ?? undefined,
    frequencyType: raw.frequencyType ?? 'DAILY',
    frequencyValue: raw.frequencyValue ?? undefined,
    targetCount: raw.targetCount ?? undefined,
    startDate: raw.startDate ? String(raw.startDate).slice(0, 10) : today,
    endDate: raw.endDate ? String(raw.endDate).slice(0, 10) : undefined,
    reminderTime: raw.reminderTime ?? undefined,
    reminderEnabled: raw.reminderEnabled ?? undefined,
    appliesEveryDay: raw.appliesEveryDay ?? true,
    dayTypeAssignments: raw.dayTypeAssignments ?? [],
    // Drop join rows whose tag was deleted underneath us rather than rendering
    // a chip with no label.
    tags: (raw.tags ?? []).filter((t) => t.tag),
    streakCount: raw.streakCount ?? undefined,
    longestStreak: raw.longestStreak ?? undefined,
  }), [today]);

  const normalizeGoal = useCallback((raw: RawGoal): Goal => ({
    id: raw.id,
    type: raw.type ?? 'WEEKLY',
    priority: raw.priority ?? 'MEDIUM',
    status: raw.status ?? 'ACTIVE',
    title: raw.title,
    description: raw.description ?? undefined,
    targetValue: Number(raw.targetValue ?? 0),
    currentValue: Number(raw.currentValue ?? 0),
    unit: raw.unit ?? undefined,
    startDate: raw.startDate ? String(raw.startDate).slice(0, 10) : today,
    endDate: raw.endDate ? String(raw.endDate).slice(0, 10) : today,
    carriedOverFrom: raw.carriedOverFrom ?? undefined,
    // A day-type assignment whose day type was deleted arrives with a null
    // relation; render the scoped chip from what survives rather than
    // crashing on `.name` of null.
    appliesEveryDay: raw.appliesEveryDay ?? true,
    dayTypeNames: (raw.dayTypeAssignments ?? [])
      .map((a) => a?.dayType?.name)
      .filter((name): name is string => Boolean(name)),
    project: raw.project ?? null,
    // Counted from the `completedAt` flags the list already selects, not from a
    // separate query per goal. `null` is the right zero here: the columns are
    // non-null on the client model so a goal with no milestones can't produce
    // `NaN` counts in the drawer's "0 / 0" heading.
    milestoneCount: raw.milestones?.length ?? 0,
    milestoneDoneCount:
      raw.milestones?.filter((m) => m?.completedAt != null).length ?? 0,
    // Hierarchy, from the list payload's id/title-only select. `_count.subGoals`
    // is preferred over `subGoals.length` because the array is capped at 12
    // server-side - `length` would report 12 for a goal that has 20.
    parentGoalId: raw.parentGoal?.id,
    parentGoalTitle: raw.parentGoal?.title,
    subGoals:
      raw.subGoals?.map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        currentValue: Number(g.currentValue ?? 0),
        targetValue: Number(g.targetValue ?? 0),
      })) ?? [],
    subGoalCount: raw.subGoalCount ?? raw.subGoals?.length ?? 0,
    // `today` is a real dependency: `normalizeGoal` falls back to it for a
    // missing start/end date. It was missing from this array, so the normalizer
    // latched the value from the very first render — which, before
    // `selectedDate` is populated by the effect above, is the '1970-01-01'
    // sentinel, giving every goal created in that window a 1970 start date.
  }), [today]);

  /*
   * Loads every habit, not the first 100.
   *
   * The list route returns a bare array with no total count, so a single
   * `?limit=100` could only ever guess: `limit=100` truncated silently for anyone
   * with more than 100 habits, and since the Archived tab and the search/filter
   * controls are all client-side over this array, a habit past the cut was
   * invisible *and* unfilterable — it looked deleted. A bound was passed
   * specifically to avoid that, and the same problem existed in the other two
   * requests below.
   *
   * Paging until a short page comes back is the only reliable termination test
   * available without a count. `HABIT_FETCH_PAGE` is the per-request batch and
   * `HABIT_FETCH_MAX` is a ceiling on the whole fetch so a server that keeps
   * returning full pages cannot spin this forever.
   */
  /**
   * Loads every goal, not the first 50.
   *
   * This request previously sent no pagination at all and took whatever the
   * route's default page happened to be. Every tab, filter and count on
   * `/goals` — and every goal widget elsewhere in the app — is computed over
   * this array client-side, so a goal past the cut was not merely hidden from a
   * list: it was absent from "3 of 5 done today", from the behind-pace count,
   * and from the search that was supposed to find it. It looked deleted.
   *
   * `meta.hasMore` is the authoritative stop signal, with the short-page test as
   * the fallback. Stopping only on a short page would loop forever against a
   * server that caps `limit` below the value requested, since that page is never
   * short.
   */
  const fetchAllGoals = useCallback(
    async (
      signal: AbortSignal
    ): Promise<
      { ok: true; goals: Goal[] } | { ok: false; status: number; error: unknown }
    > => {
      const collected: Goal[] = [];

      try {
        for (;;) {
          const params = new URLSearchParams({
            limit: String(GOAL_FETCH_PAGE),
            offset: String(collected.length),
          });
          const res = await fetch(`/api/goals?${params.toString()}`, { signal });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            return {
              ok: false,
              status: res.status,
              error: new Error(apiErrorMessage(j, 'Failed to load goals')),
            };
          }

          const json = await res.json();
          const batch = Array.isArray(json?.data) ? (json.data as RawGoal[]) : [];
          collected.push(...batch.map(normalizeGoal));

          const hasMore = json?.meta?.hasMore;
          const more =
            typeof hasMore === 'boolean' ? hasMore : batch.length >= GOAL_FETCH_PAGE;

          if (!more) break;
          if (collected.length >= GOAL_FETCH_MAX) break;
          // A zero-length full page means the server will not advance the offset;
          // re-requesting it would loop forever.
          if (batch.length === 0) break;
        }

        return { ok: true, goals: collected };
      } catch (error) {
        return { ok: false, status: 0, error };
      }
    },
    [normalizeGoal]
  );

  const fetchAllHabits = useCallback(
    async (
      signal: AbortSignal
    ): Promise<
      { ok: true; habits: Habit[] } | { ok: false; status: number; error: unknown }
    > => {
      const collected: Habit[] = [];

      try {
        for (;;) {
          const params = new URLSearchParams({
            includeArchived: 'true',
            limit: String(HABIT_FETCH_PAGE),
            offset: String(collected.length),
          });
          const res = await fetch(`/api/habits?${params.toString()}`, { signal });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            return {
              ok: false,
              status: res.status,
              error: new Error(apiErrorMessage(j, 'Failed to load habits')),
            };
          }
          const json = await res.json();
          const batch = Array.isArray(json?.data) ? (json.data as RawHabit[]) : [];
          collected.push(...batch.map(normalizeHabit));

          /*
           * `meta.hasMore` is the authoritative answer and is preferred, with the
           * short-page test as the fallback for an older response shape. Relying
           * only on `batch.length < page` would loop forever against a server that
           * caps `limit` below the requested value (returning a full 20-row page to
           * a `limit=100` request forever), since that page is never "short".
           */
          const hasMore = json?.meta?.hasMore;
          const more =
            typeof hasMore === 'boolean'
              ? hasMore
              : batch.length >= HABIT_FETCH_PAGE;

          if (!more) break;
          if (collected.length >= HABIT_FETCH_MAX) break;
        }

        return { ok: true, habits: collected };
      } catch (error) {
        return { ok: false, status: 0, error };
      }
    },
    [normalizeHabit]
  );

  const fetchAll = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDataError(null);
    try {
      // `/api/routine` is **no longer fetched here**.
      //
      // It returned every template and every block for every day type, and its
      // only consumer was the old `/routine` page, which needed the per-date
      // resolved schedule that request does not contain — so it also issued its
      // own `/api/routine/today` call. Two sources of block data with different
      // shapes and different identities.
      //
      // `/routine` now owns its single request through `useRoutineDay`, and no
      // other page reads routine data from context. Removing it means every
      // dashboard page stops fetching a payload it discarded.
      const [habitResult, goalResult] = await Promise.all([
        // `includeArchived=true` is load-bearing: without it the repository
        // strips ARCHIVED rows, so the /habits "Archived" tab was permanently
        // empty — and because permanent delete was only offered from that tab,
        // the app's one hard-delete control was unreachable.
        //
        // Both paginators resolve to a result object rather than rejecting, so the
        // `status !== 401` handling below can tell "the session died" apart
        // from "this request failed" — `Promise.all` would otherwise reject on the
        // first failure and the 401 check further down would never run.
        fetchAllHabits(controller.signal),
        fetchAllGoals(controller.signal),
      ]);

      if (habitResult.ok) {
        setHabits(habitResult.habits);
      } else if (habitResult.status !== 401) {
        throw habitResult.error;
      }

      if (goalResult.ok) {
        setGoals(goalResult.goals);
      } else if (goalResult.status !== 401) {
        throw goalResult.error;
      }

      // A 401 is not swallowed. The `status !== 401` guards skip reporting, so
      // an expired session left both lists empty and still called
      // `setDataLoaded(true)` — every page then rendered a confident "nothing
      // here yet" instead of prompting a re-login.
      if (
        (habitResult.ok === false && habitResult.status === 401) ||
        (goalResult.ok === false && goalResult.status === 401)
      ) {
        throw new Error('Your session expired. Sign in again to load your data.');
      }

      setDataLoaded(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to load dashboard data:', error);
      setDataError(error instanceof Error ? error.message : 'Failed to load data');
    }
  }, [fetchAllHabits, fetchAllGoals]);

  /**
   * Load the habit logs for the selected date.
   *
   * These live in their own request because `GET /api/habits` returns
   * `_count.logs` (a number), not the log rows — reading them off the habits
   * payload is why every checkbox used to reset on refresh.
   *
   * Kept out of `fetchAll`'s `Promise.all` deliberately: a failure here degrades
   * habits *only*, whereas throwing would blank habits, routine **and** goals
   * at once.
   *
   * A failure is still reported. The old code logged to the console and
   * returned, leaving `habitLogs` empty — indistinguishable from a genuine day
   * with nothing ticked, and it read as silent data loss: every checkbox
   * rendered unticked with no explanation.
   */
  const fetchHabitLogs = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/habits/logs?date=${encodeURIComponent(date)}`);
      if (res.status === 401) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setDataError(apiErrorMessage(j, `Failed to load habit logs (${res.status})`));
        return;
      }
      const json = await res.json();
      const rows: Array<{
        id: string;
        habitId: string;
        date: string | Date;
        status: LogStatus;
        note?: string | null;
        completedAt?: string | Date | null;
      }> = Array.isArray(json?.data) ? json.data : [];

      setHabitLogs(
        rows.map((log) => ({
          id: log.id,
          habitId: log.habitId,
          date:
            typeof log.date === 'string'
              ? log.date.slice(0, 10)
              : new Date(log.date).toISOString().slice(0, 10),
          status: log.status,
          note: log.note ?? undefined,
          completedAt: log.completedAt ? String(log.completedAt) : undefined,
        }))
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // Non-fatal for the rest of the page, but the user must be able to tell
      // "nothing logged" from "the log request failed".
      setDataError(error instanceof Error ? error.message : 'Failed to load habit logs');
    }
  }, []);

  // Single data layer: one deduped fetch per auth session with abort on
  // unmount. State resets when the session ends.
  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    if (!inflightFetch) {
      inflightFetch = fetchAll().finally(() => {
        inflightFetch = null;
      });
    } else {
      inflightFetch.then(() => undefined).catch(() => undefined);
    }
    return () => abortRef.current?.abort();
  }, [fetchAll, status]);

  const reloadData = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  // Habit logs for the selected date. Re-runs whenever the selected day or the
  // session changes, so /habits, /routine and the dashboard widgets all read one
  // source of truth instead of each guessing.
  useEffect(() => {
    if (status !== 'authenticated' || !selectedDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- date-driven data layer
    void fetchHabitLogs(selectedDate);
  }, [fetchHabitLogs, selectedDate, status]);

  // ── Habits ──────────────────────────────────────────────────────────────────
  const addHabit = useCallback(async (habit: Omit<Habit, 'id'> & { tagIds?: string[]; appliesEveryDay?: boolean; dayTypeIds?: string[] }) => {
    const { appliesEveryDay, dayTypeIds, ...habitData } = habit;
    const localHabit = { ...habitData, id: genId() };
    setHabits(prev => [...prev, localHabit]);

    if (status !== 'authenticated') {
      return localHabit;
    }

    try {
      const response = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...habitData,
          appliesEveryDay: appliesEveryDay ?? true,
          dayTypeIds: dayTypeIds ?? [],
        }),
      });
      const json = await throwIfNotOk(response, 'Failed to create habit') as { data: never };
      const saved = normalizeHabit(json.data);
      setHabits(prev => prev.map(item => item.id === localHabit.id ? saved : item));
      return saved;
    } catch (error) {
      console.error('addHabit failed:', error);
      // Roll back the optimistic item so the UI never shows unsaved data.
      setHabits(prev => prev.filter(item => item.id !== localHabit.id));
      throw error;
    }
  }, [normalizeHabit, status]);

  const updateHabit = useCallback(async (id: string, updates: UpdateHabitPatch) => {
    const { appliesEveryDay, dayTypeIds, ...fields } = updates;
    const prev = habits.find(h => h.id === id);
    setHabits(prevList => prevList.map(h => h.id === id ? { ...h, ...fields } : h));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const { id: _omit, ...updateFields } = fields;
      const response = await fetch(`/api/habits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updateFields,
          appliesEveryDay,
          dayTypeIds,
        }),
      });
      const json = await throwIfNotOk(response, 'Failed to update habit') as { data: never };
      const saved = normalizeHabit(json.data);
      setHabits(prevList => prevList.map(h => h.id === id ? saved : h));
    } catch (error) {
      console.error('updateHabit failed:', error);
      if (prev) setHabits(prevList => prevList.map(h => h.id === id ? prev : h));
      throw error;
    }
  }, [habits, normalizeHabit, status]);

  /**
   * Archive a habit.
   *
   * Goes through the dedicated endpoint (see the interface doc) so
   * `HabitService.archiveHabit` runs: it stamps `archivedAt`, writes the
   * `HABIT_ARCHIVED` audit row, and applies the same guards as every other
   * archive path. The endpoint answers `{ success: true }` with no `data`, so
   * the local record is reconciled from the known resulting status instead of
   * the response body.
   */
  const archiveHabit = useCallback(async (id: string) => {
    if (status !== 'authenticated' || id.startsWith('local-')) return;

    // Snapshot the *single* habit, not the array: the rollback maps over the
    // list and substitutes the previous record, so passing the whole array
    // spliced the array into itself as one element.
    const prev = habits.find(h => h.id === id);
    setHabits(prevList => prevList.map(h => h.id === id ? { ...h, status: 'ARCHIVED' } : h));

    try {
      const res = await fetch(`/api/habits/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await throwIfNotOk(res, 'Failed to archive habit');
    } catch (error) {
      console.error('archiveHabit failed:', error);
      if (prev) setHabits(prevList => prevList.map(h => h.id === id ? prev : h));
      throw error;
    }
  }, [habits, status]);

  /**
   * Pause a habit through the service so the optional `PAUSE` override is
   * written when a resume date is given, matching every other pause path.
   */
  const pauseHabit = useCallback(async (id: string, reason?: string) => {
    if (status !== 'authenticated' || id.startsWith('local-')) return;

    const prev = habits.find(h => h.id === id);
    setHabits(prevList => prevList.map(h => h.id === id ? { ...h, status: 'PAUSED' } : h));

    try {
      const res = await fetch(`/api/habits/${id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await throwIfNotOk(res, 'Failed to pause habit');
    } catch (error) {
      console.error('pauseHabit failed:', error);
      if (prev) setHabits(prevList => prevList.map(h => h.id === id ? prev : h));
      throw error;
    }
  }, [habits, status]);

  /**
   * Resume a habit through the service, which is the only thing that clears
   * `PAUSE` overrides. Without this a habit could be `ACTIVE` and still
   * reject every log.
   */
  const resumeHabit = useCallback(async (id: string) => {
    if (status !== 'authenticated' || id.startsWith('local-')) return;

    const prev = habits.find(h => h.id === id);
    setHabits(prevList => prevList.map(h => h.id === id ? { ...h, status: 'ACTIVE' } : h));

    try {
      const res = await fetch(`/api/habits/${id}/resume`, { method: 'POST' });
      await throwIfNotOk(res, 'Failed to resume habit');
    } catch (error) {
      console.error('resumeHabit failed:', error);
      if (prev) setHabits(prevList => prevList.map(h => h.id === id ? prev : h));
      throw error;
    }
  }, [habits, status]);

  /**
   * Restore an archived habit.
   *
   * Uses the dedicated `?restore=true` endpoint rather than a PATCH with
   * `status: 'ACTIVE'`, because the endpoint clears `archivedAt` and writes a
   * `HABIT_RESTORED` audit entry; a PATCH would leave the archive timestamp in
   * place and log nothing.
   */
  const restoreHabit = useCallback(async (id: string) => {
    if (status !== 'authenticated' || id.startsWith('local-')) return;

    // Snapshot the *single* habit, not the array. The rollback maps over the
    // list and substitutes the previous record, so handing it the whole array
    // spliced the array into itself as one element.
    const prev = habits.find(h => h.id === id);
    setHabits(prevList => prevList.map(h => h.id === id ? { ...h, status: 'ACTIVE' } : h));

    try {
      const res = await fetch(`/api/habits/${id}/archive?restore=true`, { method: 'POST' });
      const json = await throwIfNotOk(res, 'Failed to restore habit') as { data: never };
      const restored = normalizeHabit(json.data);
      setHabits(prevList => prevList.map(h => h.id === id ? restored : h));
    } catch (error) {
      console.error('restoreHabit failed:', error);
      if (prev) setHabits(prevList => prevList.map(h => h.id === id ? prev : h));
      throw error;
    }
  }, [habits, normalizeHabit, status]);

  const deleteHabit = useCallback(async (id: string) => {
    const prev = habits;
    setHabits(prevList => prevList.filter(h => h.id !== id));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const response = await fetchWithAuth(`/api/habits/${id}`, { method: 'DELETE' });
      await throwIfNotOk(response, 'Failed to delete habit');
    } catch (error) {
      console.error('deleteHabit failed:', error);
      setHabits(prev);
      throw error;
    }
  }, [habits, status]);

  const logHabit = useCallback(async (habitId: string, date: string, statusValue: LogStatus, note?: string) => {
    const previous = habitLogs.find(l => l.habitId === habitId && l.date === date);
    setHabitLogs(prev => {
      const existing = prev.find(l => l.habitId === habitId && l.date === date);
      if (existing) {
        return prev.map(l =>
          l.habitId === habitId && l.date === date
            ? { ...l, status: statusValue, note, completedAt: statusValue === 'COMPLETED' ? nowForUser(userTimezone) : undefined }
            : l
        );
      }
      return [...prev, {
        id: genId(),
        habitId,
        date,
        status: statusValue,
        note,
        completedAt: statusValue === 'COMPLETED' ? nowForUser(userTimezone) : undefined,
      }];
    });

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch(`/api/habits/${habitId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, status: statusValue, note }),
      });
      const json = await throwIfNotOk(response, 'Failed to save habit log') as { data?: { log?: { id?: string; status?: LogStatus; note?: string | null; completedAt?: string | Date | null }; id?: string; status?: LogStatus; note?: string | null; completedAt?: string | Date | null } };
      // The log route nests the record under `data.log`; accept both shapes.
      const savedLog = json.data?.log ?? json.data;
      setHabitLogs(prev => prev.map(log => log.habitId === habitId && log.date === date ? {
        ...log,
        id: savedLog?.id ?? log.id,
        status: savedLog?.status ?? statusValue,
        note: savedLog?.note ?? note,
        completedAt: savedLog?.completedAt ? String(savedLog.completedAt) : log.completedAt,
      } : log));
    } catch (error) {
      console.error('logHabit failed:', error);
      // Roll back optimistic toggle.
      setHabitLogs(prev => {
        if (!previous) return prev.filter(l => !(l.habitId === habitId && l.date === date));
        return prev.map(l => l.habitId === habitId && l.date === date ? previous : l);
      });
      throw error;
    }
  },
  [
    habitLogs,
    status,
    /*
      `userTimezone` is read by `nowForUser` when stamping `completedAt`. It was
      missing, so the callback kept whatever zone was resolved when it was built
      — and that is `DEFAULT_TZ` until the settings store finishes loading. A
      habit ticked in the first moments after sign-in would therefore be stamped
      in UTC, which is the wrong calendar day for any user east of Greenwich.
    */
    userTimezone,
  ]
  );

  const getLogForDate = useCallback((habitId: string, date: string) => {
    return habitLogs.find(l => l.habitId === habitId && l.date === date);
  }, [habitLogs]);

  // ── Goals ───────────────────────────────────────────────────────────────────
  /**
   * Create a goal.
   *
   * The body used to be a hand-written allow-list of seven fields, silently
   * dropping `projectId`, `parentGoalId`, `isPublic`, `appliesEveryDay`,
   * `dayTypeIds`, `tagIds` and `milestones` — every one of which
   * `createGoalSchema` accepts and the service implements. The practical effect
   * was that **no client could create a milestone**, and no goal could be linked
   * to a project or scoped to a day type: not a missing feature so much as a
   * working API with the plug pulled out.
   *
   * `CreateGoalInput` now travels whole. The optimistic local row still gets a
   * `local-` id so an offline create renders immediately; the server's row
   * replaces it on success exactly as before.
   */
  const addGoal = useCallback(async (goal: CreateGoalRequest): Promise<Goal> => {
    const startDate = goal.startDate ?? today;
    const localGoal: Goal = {
      id: genId(),
      type: goal.type,
      priority: goal.priority ?? 'MEDIUM',
      status: 'ACTIVE',
      title: goal.title,
      description: goal.description ?? undefined,
      targetValue: goal.targetValue,
      currentValue: goal.currentValue ?? 0,
      unit: goal.unit ?? undefined,
      startDate,
      endDate: goal.endDate ?? addDays(startDate, 365),
      appliesEveryDay: goal.appliesEveryDay ?? true,
      dayTypeNames: [],
      project: null,
      // The create form sends milestones as full objects, but the server returns
      // them as `{ id, completedAt }` on the normalized row - which is what the
      // count derives from. Counting the request payload instead would show the
      // right number here and then correct itself a moment later.
      milestoneCount: goal.milestones?.length ?? 0,
      // Optimistically zero, and that is honest: nothing the form can send marks
      // a milestone complete. Better a count that fills in from the refetch than
      // a fake "all done" on a goal the user just created with three steps.
      milestoneDoneCount: 0,
      // A newly created goal has no children yet, so this is not optimistic
      // guesswork - it is the correct value. `parentGoalId`/`parentGoalTitle`
      // are omitted because they are optional and the form's value lands on the
      // refetch that follows.
      subGoals: [],
      subGoalCount: 0,
    };
    setGoals(prev => [...prev, localGoal]);

    if (status !== 'authenticated') {
      return localGoal;
    }

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...goal,
          // Milestone `dueDate` is a nested optional, so the label has to be
          // anchored to UTC midnight — `new Date('2026-11-02')` already is, and
          // sending the bare string would let the server read it as an instant in
          // *its* zone and shift the day for anyone west of UTC.
          milestones: goal.milestones?.map((m) => ({
            ...m,
            dueDate: m.dueDate ? `${m.dueDate}T00:00:00.000Z` : undefined,
          })),
        }),
      });
      const json = await throwIfNotOk(response, 'Failed to create goal') as { data: never };
      const saved = normalizeGoal(json.data);
      setGoals(prev => prev.map(item => item.id === localGoal.id ? saved : item));
      return saved;
    } catch (error) {
      console.error('addGoal failed:', error);
      setGoals(prev => prev.filter(item => item.id !== localGoal.id));
      throw error;
    }
  }, [normalizeGoal, status, today]);

  const updateGoal = useCallback(async (id: string, updates: UpdateGoalPatch) => {
    const prev = goals.find(g => g.id === id);
    setGoals(prevList => prevList.map(g => g.id === id ? { ...g, ...updates } : g));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const { id: _omit, ...fields } = updates;
      const response = await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const json = await throwIfNotOk(response, 'Failed to update goal') as { data: never };
      const saved = normalizeGoal(json.data);
      setGoals(prevList => prevList.map(g => g.id === id ? saved : g));
    } catch (error) {
      console.error('updateGoal failed:', error);
      if (prev) setGoals(prevList => prevList.map(g => g.id === id ? prev : g));
      throw error;
    }
  }, [goals, normalizeGoal, status]);

  const deleteGoal = useCallback(async (id: string) => {
    const prev = goals;
    setGoals(prevList => prevList.filter(g => g.id !== id));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const response = await fetchWithAuth(`/api/goals/${id}`, { method: 'DELETE' });
      await throwIfNotOk(response, 'Failed to delete goal');
    } catch (error) {
      console.error('deleteGoal failed:', error);
      setGoals(prev);
      throw error;
    }
  }, [goals, status]);

  /**
   * Set a goal's progress to an absolute value.
   *
   * This used to `PATCH /api/goals/[id]` with `{ currentValue }`, which writes
   * the column and **no `GoalProgress` row**. That made it invisible to every
   * feature derived from the log — sparkline, streak, observed velocity,
   * projected finish — so a goal driven by this slider rendered with an empty
   * history no matter how much work had been logged.
   *
   * It now goes to `POST /api/goals/[id]/progress` with `mode: 'set'`. That
   * endpoint takes an absolute total and computes the delta itself, so the log
   * stays a faithful record either way, and `autoComplete` is left on so
   * reaching the target completes the goal exactly as the check-in path does not.
   *
   * `local-` ids are the offline-created placeholders in `addGoal`; they have no
   * server row to write to.
   */
  const updateGoalProgress = useCallback(async (id: string, value: number, note?: string) => {
    const prev = goals.find(g => g.id === id);
    const target = prev?.targetValue ?? value;
    const clamped = Math.min(target, Math.max(0, value));
    setGoals(prevList => prevList.map(g => {
      if (g.id !== id) return g;
      return { ...g, currentValue: clamped, status: clamped >= g.targetValue ? 'COMPLETED' : 'ACTIVE' };
    }));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const response = await fetch(`/api/goals/${id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: clamped, mode: 'set', note }),
      });
      const json = await throwIfNotOk(response, 'Failed to update goal progress') as { data: never };
      const saved = normalizeGoal(json.data);
      setGoals(prevList => prevList.map(g => g.id === id ? saved : g));
    } catch (error) {
      console.error('updateGoalProgress failed:', error);
      if (prev) setGoals(prevList => prevList.map(g => g.id === id ? prev : g));
      throw error;
    }
  }, [goals, normalizeGoal, status]);

  // ── Day Meta ─────────────────────────────────────────────────────────────────
  const getDayMeta = useCallback((date: string): DayMeta => {
    return dayMeta[date] || { date, mode: 'NORMAL', contextTags: [] };
  }, [dayMeta]);

  const setDayMeta = useCallback((date: string, meta: Partial<DayMeta>) => {
    setDayMetaMap(prev => ({
      ...prev,
      [date]: { ...(prev[date] || { date, mode: 'NORMAL' as DayMode, contextTags: [] }), ...meta, date },
    }));
  }, []);

  // ── Undo ─────────────────────────────────────────────────────────────────────
  const pushUndo = useCallback((fn: () => void) => {
    setUndoStack(prev => [...prev.slice(-9), fn]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (!last) return prev;
      last();
      return prev.slice(0, -1);
    });
  }, []);

  return (
    <AppContext.Provider value={{
      habits, habitLogs, dataLoaded, dataError, reloadData,
      addHabit, updateHabit, archiveHabit, restoreHabit, pauseHabit, resumeHabit, deleteHabit, logHabit, getLogForDate,
      goals, addGoal, updateGoal, deleteGoal, updateGoalProgress,
      dayMeta, setDayMeta, getDayMeta,
      selectedDate, setSelectedDate,
      selectedRoutineDayTypeId, setSelectedRoutineDayTypeId,
      undoStack, pushUndo, undo,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// Re-exported here so existing `import { useApp } from '@/context/AppContext'`
// code keeps working. New code should import from '@/context/useApp'.
export { useApp } from './useApp';
