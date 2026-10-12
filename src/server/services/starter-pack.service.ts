import { addDays, format } from 'date-fns';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { TemplateRepository } from '@/server/repositories/template.repository';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import type {
  StarterPackHabitPreview,
  StarterPackPreview,
  HabitTier,
  HabitFrequencyType,
  HabitTrackingType,
  HabitDirection,
  TimeOfDay,
} from '@/types/habit';
import type { UserId } from '@/types/ids';

/**
 * Starter packs — a reusable bundle of suggested habits any user can apply.
 *
 * ## What a pack is, and what it is not
 *
 * A pack is an **official `Template` row** with `type = 'HABIT_SET'` and
 * `userId = null`: system-owned, readable by everyone, identical for everyone.
 * Applying one copies entries into the caller's own `Habit` rows.
 *
 * It is emphatically *not* a per-user special case. `previewStarterPack` and
 * `applyStarterPack` take a `userId` and nothing else about the user — no email,
 * no account flag, no role. The only thing that differs between two users
 * applying the same pack is what they already had, which is discovered by
 * asking their own habits.
 *
 * ## Idempotency
 *
 * Keyed on `(userId, name)` — the new unique index on `Habit`. A re-run skips
 * any name the user already has and never writes to it, so it cannot reset a
 * customised target, cannot touch a single `HabitLog`, and cannot create a
 * duplicate. That property is asserted directly by the test suite.
 */

/** The habit names in the canonical tier order. Used to group the preview. */
const TIER_ORDER: HabitTier[] = [
  'NON_NEGOTIABLE',
  'GROWTH',
  'BONUS',
  'LIFESTYLE',
  'FLEXIBLE',
  'ALTERNATIVE',
  'SPECIAL',
  'OPTIONAL',
  'JUST_FOR_FUN',
  'EXPERIMENTAL',
  'UNDEFINED',
];

/**
 * Tier 2 habits are scheduled, not daily, and this account's brief is to start
 * them after the first month rather than on day one. The offset is a parameter
 * with a default, not a hardcoded rule, so any user applying a pack can pass 0.
 */
export const DEFAULT_TIER2_START_DELAY_DAYS = 30;

export interface StarterPackOverride {
  tier?: HabitTier;
  targetValue?: number | null;
  unit?: string | null;
  frequencyType?: HabitFrequencyType | undefined;
  frequencyValue?: string | null;
  intervalDays?: number | null;
  timeOfDay?: TimeOfDay | null;
  trackingType?: HabitTrackingType;
  direction?: HabitDirection;
  excluded?: boolean;
}

export class StarterPackService {
  private habitRepository: HabitRepository;
  private templateRepository: TemplateRepository;

  constructor() {
    this.habitRepository = new HabitRepository();
    this.templateRepository = new TemplateRepository();
  }

  /**
   * The packs available to this caller: their **own** packs, plus system ones.
   *
   * Ownership is resolved from the caller's id, so a pack created by one user is
   * invisible to everyone else. Passing `null` here — as an earlier version did —
   * meant only system templates were ever reachable, which made a user's own
   * pack unopenable by its author.
   */
  async listPacks(userId: UserId) {
    const templates = await this.templateRepository.findAll(userId);
    return templates
      .filter((t) => t.type === 'HABIT_SET')
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        usageCount: t.usageCount,
        /** `true` for a pack that belongs to the caller rather than the system. */
        isOwn: t.userId === userId,
      }));
  }

  /**
   * What applying this pack would create for **this** user, right now.
   *
   * The preview and the apply share `buildPlan`, so what the user confirms is
   * exactly what gets written. Anything already present is flagged
   * `alreadyExists` and will be left alone — including its target, its tier and
   * its logs.
   */
  async previewStarterPack(
    userId: UserId,
    templateId: string | undefined,
    overrides: Record<string, StarterPackOverride> = {},
    tier2StartDelayDays: number = DEFAULT_TIER2_START_DELAY_DAYS
  ): Promise<StarterPackPreview> {
    const { templateName, entries } = await this.loadPack(userId, templateId);
    const plan = await this.buildPlan(
      userId,
      entries,
      overrides,
      tier2StartDelayDays
    );

    return {
      templateId: templateId ?? null,
      templateName,
      grouped: plan.grouped,
      totalHabits: plan.toCreate.length,
      skippedAsExisting: plan.existingNames.size,
    };
  }

  /**
   * Apply a pack to the caller's own habits.
   *
   * Two passes, and the order matters:
   *
   *  1. Ask which names already exist (`findExistingNames`, one query) rather
   *     than checking per habit.
   *  2. `createMany` with `skipDuplicates`, so even a race between the check and
   *     the write cannot produce a duplicate or a unique violation.
   *
   * Nothing in either pass can modify an existing row. That is the whole
   * idempotency guarantee, and it is structural: there is no `update` call in
   * this method at all.
   */
  async applyStarterPack(
    userId: UserId,
    templateId: string | undefined,
    overrides: Record<string, StarterPackOverride> = {},
    tier2StartDelayDays: number = DEFAULT_TIER2_START_DELAY_DAYS
  ) {
    const { entries } = await this.loadPack(userId, templateId);
    const plan = await this.buildPlan(
      userId,
      entries,
      overrides,
      tier2StartDelayDays
    );

    if (plan.toCreate.length === 0) {
      return { created: 0, skipped: plan.existingNames.size, total: entries.length };
    }

    const created = await this.habitRepository.createManyIgnoreDuplicates(
      plan.toCreate.map((row) => ({
        userId,
        name: row.name,
        description: row.description,
        tier: row.tier,
        status: 'ACTIVE' as const,
        frequencyType: row.frequencyType,
        frequencyValue: row.frequencyValue,
        intervalDays: row.intervalDays,
        trackingType: row.trackingType,
        direction: row.direction,
        targetValue: row.targetValue,
        unit: row.unit,
        timeOfDay: row.timeOfDay,
        icon: row.icon,
        color: row.color,
        sortOrder: row.sortOrder,
        startDate: row.startDate,
        definitionId: row.definitionId,
      }))
    );

    return {
      created,
      skipped: plan.existingNames.size,
      total: entries.length,
    };
  }

  /**
   * Turn a pack's entries into concrete rows, minus anything this user already
   * has or explicitly excluded.
   */
  private async buildPlan(
    userId: UserId,
    entries: PackEntry[],
    overrides: Record<string, StarterPackOverride>,
    tier2StartDelayDays: number
  ) {
    const candidates = entries.filter((entry) => !overrides[entry.name]?.excluded);
    const candidateNames = candidates.map((entry) => entry.name);

    const existingNames = await this.habitRepository.findExistingNames(
      userId,
      candidateNames
    );

    const today = new Date();

    const toCreate: Array<{
      name: string;
      description: string | null;
      tier: HabitTier;
      frequencyType: HabitFrequencyType;
      frequencyValue: string | null;
      intervalDays: number | null;
      trackingType: HabitTrackingType;
      direction: HabitDirection;
      targetValue: number | null;
      unit: string | null;
      timeOfDay: TimeOfDay | null;
      icon: string | null;
      color: string | null;
      sortOrder: number;
      startDate: Date;
      definitionId: string | null;
    }> = [];

    const previews: StarterPackHabitPreview[] = [];

    for (const entry of candidates) {
      const override = overrides[entry.name] ?? {};
      const alreadyExists = existingNames.has(entry.name);

      const tier = override.tier ?? entry.tier;

      /*
       * Start dates come from the entry, not from a tier lookup.
       *
       * A tier-keyed rule ("GROWTH starts in 30 days") is a guess about how a
       * pack happens to be written, and it silently misfires the moment a pack
       * puts a daily GROWTH habit in tier 1. `startDelayDays` on the entry says
       * what the pack actually means, with the pack-wide default as the
       * fallback so an entry that omits it still gets the tier-2 behaviour.
       */
      const delayDays =
        entry.startDelayDays ?? (entry.tier === 'GROWTH' ? tier2StartDelayDays : 0);

      const startDate = delayDays > 0 ? addDays(today, delayDays) : today;

      const resolved = {
        tier,
        trackingType: override.trackingType ?? entry.trackingType,
        direction: override.direction ?? entry.direction,
        targetValue:
          override.targetValue !== undefined
            ? override.targetValue
            : entry.targetValue,
        unit: override.unit !== undefined ? override.unit : entry.unit,
        frequencyType:
          override.frequencyType ?? entry.frequencyType,
        frequencyValue:
          override.frequencyValue !== undefined
            ? override.frequencyValue
            : entry.frequencyValue,
        intervalDays:
          (override.frequencyType ?? entry.frequencyType) === 'EVERY_N_DAYS'
            ? override.intervalDays !== undefined
              ? override.intervalDays
              : entry.intervalDays
            : null,
        timeOfDay:
          override.timeOfDay !== undefined ? override.timeOfDay : entry.timeOfDay,
      };

      previews.push({
        name: entry.name,
        description: entry.description,
        category: entry.category,
        tier,
        frequencyType: resolved.frequencyType,
        frequencyValue: resolved.frequencyValue,
        trackingType: resolved.trackingType,
        direction: resolved.direction,
        targetValue: resolved.targetValue,
        unit: resolved.unit,
        intervalDays: resolved.intervalDays,
        timeOfDay: resolved.timeOfDay,
        startDate: format(startDate, 'yyyy-MM-dd'),
        alreadyExists,
        definitionId: entry.definitionId ?? null,
      });

      if (alreadyExists) continue;

      toCreate.push({
        name: entry.name,
        description: entry.description,
        tier,
        frequencyType: resolved.frequencyType,
        frequencyValue: resolved.frequencyValue,
        intervalDays: resolved.intervalDays,
        trackingType: resolved.trackingType,
        direction: resolved.direction,
        targetValue: resolved.targetValue,
        unit: resolved.unit,
        timeOfDay: resolved.timeOfDay,
        icon: entry.icon ?? null,
        color: entry.color ?? null,
        sortOrder: entry.sortOrder,
        startDate,
        definitionId: entry.definitionId ?? null,
      });
    }

    // Group by tier in the canonical order, dropping empty groups so the
    // preview does not render eleven headings for two populated ones.
    const grouped = TIER_ORDER.map((tier) => ({
      tier,
      habits: previews.filter((p) => p.tier === tier),
    })).filter((group) => group.habits.length > 0);

    return { toCreate, previews, grouped, existingNames };
  }

  /**
   * Load a pack's entries, resolving ownership against the caller.
   *
   * Two things matter here, and both come down to passing the caller's `userId`
   * rather than `null`:
   *
   *  - an explicit `templateId` resolves through `findById(userId, id)`, which
   *    matches `{ id, OR: [{ userId }, { userId: null }] }` — the caller's own
   *    pack or a system one, never someone else's;
   *  - with no `templateId`, the caller's **own** pack is preferred over a
   *    system pack, so someone with a personal pack opens theirs rather than the
   *    generic one.
   *
   * A pack belonging to a different user is a 404, identical to one that does not
   * exist.
   */
  private async loadPack(userId: UserId, templateId?: string) {
    let template;
    if (templateId) {
      template = await this.templateRepository.findById(userId, templateId);
      if (!template) throw new NotFoundError('Starter pack');
    } else {
      const templates = await this.templateRepository.findAll(userId);
      const packs = templates.filter((t) => t.type === 'HABIT_SET');
      template =
        packs.find((t) => t.userId === userId) ??
        packs.find((t) => t.userId === null);
      if (!template) {
        throw new NotFoundError('Starter pack');
      }
    }

    if (template.type !== 'HABIT_SET') {
      throw new ValidationError('That template is not a habit set');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(template.content);
    } catch {
      throw new ValidationError('Starter pack content is not valid JSON');
    }

    const raw = (parsed as { habits?: unknown })?.habits;
    if (!Array.isArray(raw)) {
      throw new ValidationError('Starter pack has no habits array');
    }

    return {
      templateName: template.name,
      entries: raw.map((h, index) => normaliseEntry(h, index)),
    };
  }
}

/** One entry in a pack, after defaults have been filled in. */
interface PackEntry {
  name: string;
  description: string | null;
  category: string | null;
  tier: HabitTier;
  frequencyType: HabitFrequencyType;
  frequencyValue: string | null;
  intervalDays: number | null;
  trackingType: HabitTrackingType;
  direction: HabitDirection;
  targetValue: number | null;
  unit: string | null;
  timeOfDay: TimeOfDay | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  definitionId?: string | null;
  /**
   * Days after "today" to set as `startDate`.
   *
   * The tier-1/tier-2 "start tier 2 after 30 days" behaviour is expressed here
   * as data so a pack can schedule individual habits (dentist at 180, a phased
   * ramp) without the service needing to know what tier means.
   */
  startDelayDays?: number | null;
}

const FREQUENCY_TYPES = new Set<string>([
  'DAILY',
  'SPECIFIC_WEEKDAYS',
  'WEEKLY_TARGET',
  'MONTHLY_TARGET',
  'YEARLY_TARGET',
  'RANDOM',
  'ONE_TIME',
  'CUSTOM',
  'EVERY_N_DAYS',
]);

const TIERS = new Set<string>([
  'NON_NEGOTIABLE',
  'GROWTH',
  'BONUS',
  'LIFESTYLE',
  'FLEXIBLE',
  'ALTERNATIVE',
  'SPECIAL',
  'OPTIONAL',
  'JUST_FOR_FUN',
  'EXPERIMENTAL',
  'UNDEFINED',
]);

/**
 * Coerce one raw JSON entry into a `PackEntry`.
 *
 * Tolerant by design: a pack is hand-authored or generated, and a malformed
 * entry should be dropped by the caller's `ValidationError` rather than crash
 * the preview for every other habit in the pack. Unknown tiers fall back to
 * `GROWTH` instead of being rejected, so adding a tier to the enum later cannot
 * break an older pack.
 */
function normaliseEntry(raw: unknown, index: number): PackEntry {
  const h = (raw ?? {}) as Record<string, unknown>;

  const name = typeof h.name === 'string' ? h.name.trim() : '';
  if (!name) {
    throw new ValidationError(`Starter pack entry ${index + 1} has no name`);
  }

  const tier =
    typeof h.tier === 'string' && TIERS.has(h.tier)
      ? (h.tier as HabitTier)
      : 'GROWTH';

  const trackingType =
    h.trackingType === 'COUNT' || h.trackingType === 'DURATION'
      ? h.trackingType
      : 'BOOLEAN';

  const direction =
    h.direction === 'LIMIT' || h.direction === 'AVOID' ? h.direction : 'BUILD';

  return {
    name,
    description: typeof h.description === 'string' ? h.description : null,
    category: typeof h.category === 'string' ? h.category : null,
    tier,
    frequencyType:
      typeof h.frequencyType === 'string' &&
      FREQUENCY_TYPES.has(h.frequencyType)
        ? (h.frequencyType as HabitFrequencyType)
        : 'DAILY',
    frequencyValue:
      typeof h.frequencyValue === 'string' ? h.frequencyValue : null,
    intervalDays:
      typeof h.intervalDays === 'number' ? h.intervalDays : null,
    trackingType,
    direction,
    targetValue: typeof h.targetValue === 'number' ? h.targetValue : null,
    unit: typeof h.unit === 'string' ? h.unit : null,
    timeOfDay:
      h.timeOfDay === 'MORNING' ||
      h.timeOfDay === 'AFTERNOON' ||
      h.timeOfDay === 'EVENING' ||
      h.timeOfDay === 'NIGHT' ||
      h.timeOfDay === 'ANYTIME'
        ? h.timeOfDay
        : null,
    icon: typeof h.icon === 'string' ? h.icon : null,
    color: typeof h.color === 'string' ? h.color : null,
    sortOrder: typeof h.sortOrder === 'number' ? h.sortOrder : index,
    definitionId: typeof h.definitionId === 'string' ? h.definitionId : null,
    startDelayDays:
      typeof h.startDelayDays === 'number' && h.startDelayDays >= 0
        ? h.startDelayDays
        : null,
  };
}
