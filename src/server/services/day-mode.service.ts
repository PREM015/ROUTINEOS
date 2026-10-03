import { ScoreRepository } from '@/server/repositories/score.repository';
import { RoutineService } from '@/server/services/routine.service';
import { ScoringService } from '@/server/services/scoring.service';
import { UserService } from '@/server/services/user.service';
import { resolveDayTypeForDate, resolveNaturalDayType } from '@/lib/scheduling/resolve-routine';
import { DEFAULT_TZ } from '@/lib/dates';
import { ValidationError } from '@/lib/errors/app-error';
import type { DayType } from '@/generated/prisma';

/**
 * Day Mode Service
 *
 * Owns the "what kind of day is this?" state for a date: the resolved routine
 * day type (a `RoutineException` override or the natural weekday/weekend
 * rule) plus the minimum-day / rest-day flags on the stored score.
 *
 * This logic previously lived entirely in `app/api/day-mode/route.ts`, which
 * queried Prisma directly and re-implemented the exception upsert that
 * `RoutineService` already owns. Both halves now go through services, and the
 * day type comes from the single canonical resolver.
 */

export type DayMode = 'MINIMUM' | 'REST' | 'DAY_TYPE' | 'CLEAR';

export interface DayModeSnapshot {
  date: string;
  dayType: DayType;
  /**
   * The user's `DayTypeDefinition` for this date, when there is one.
   *
   * `dayType` is a six-value enum in which every custom day type collapses to
   * `CUSTOM`, so on its own it cannot say *which* custom type is active. The
   * client needs this id to highlight the right option in the selector and to
   * re-send it on the next change.
   */
  dayTypeId: string | null;
  dayTypeName: string | null;
  naturalDayType: DayType;
  templateId: string | null;
  hasException: boolean;
  exception: {
    id: string;
    dayType: DayType;
    dayTypeId: string | null;
    dayTypeName: string | null;
    templateId: string | null;
    reason: string | null;
  } | null;
  isMinimumDay: boolean;
  isRestDay: boolean;
  minimumDayTemplateId: string | null;
}

export interface SetDayModeInput {
  date: string;
  mode: DayMode;
  dayType?: DayType;
  /** Selects a specific custom day type. Omit for a built-in one. */
  dayTypeId?: string;
  reason?: string;
  templateId?: string;
}

export class DayModeService {
  private scoreRepository: ScoreRepository;
  private routineService: RoutineService;
  private scoringService: ScoringService;
  private userService: UserService;

  constructor() {
    this.scoreRepository = new ScoreRepository();
    this.routineService = new RoutineService();
    this.scoringService = new ScoringService();
    this.userService = new UserService();
  }

  /**
   * Resolved day-mode state for a date.
   */
  async getDayMode(userId: string, date: string): Promise<DayModeSnapshot> {
    const timezone = await this.userService.getTimezone(userId).catch(
      () => DEFAULT_TZ
    );

    const [exception, score, resolved] = await Promise.all([
      this.routineService.listExceptions(userId, date).then((rows) => rows[0] ?? null),
      this.scoreRepository.findByDate(userId, date),
      // Canonical resolution: RoutineException first, then natural weekday rule.
      resolveDayTypeForDate(userId, date),
    ]);

    return {
      date,
      dayType: resolved.dayType,
      dayTypeId: resolved.dayTypeId ?? exception?.dayTypeId ?? null,
      dayTypeName: resolved.dayTypeName ?? exception?.dayTypeDef?.name ?? null,
      naturalDayType: resolveNaturalDayType(date, timezone),
      templateId: resolved.templateId,
      hasException: Boolean(exception),
      exception: exception
        ? {
            id: exception.id,
            dayType: exception.dayType,
            dayTypeId: exception.dayTypeId,
            dayTypeName: exception.dayTypeDef?.name ?? null,
            templateId: exception.templateId,
            reason: exception.reason,
          }
        : null,
      isMinimumDay: score?.isMinimumDay ?? false,
      isRestDay: score?.isRestDay ?? false,
      minimumDayTemplateId: score?.minimumDayTemplateId ?? null,
    };
  }

  /**
   * Apply a day-mode change for a date and return the mode-specific payload.
   */
  async setDayMode(
    userId: string,
    input: SetDayModeInput
  ): Promise<Record<string, unknown>> {
    const { date, mode, dayType, dayTypeId, reason, templateId } = input;

    if (mode === 'MINIMUM') {
      const breakdown = await this.scoringService.calculateDailyScore(userId, date, {
        isMinimumDay: true,
        minimumDayTemplateId: templateId,
      });
      return { mode: 'MINIMUM', score: breakdown };
    }

    if (mode === 'REST') {
      await this.scoreRepository.upsertScore(userId, date, {
        isRestDay: true,
        restDayReason: reason ?? null,
        totalScore: null,
        coreScore: null,
        growthScore: null,
        bonusScore: null,
      });
      return { mode: 'REST' };
    }

    if (mode === 'CLEAR') {
      await this.routineService.clearException(userId, date);
      return { mode: 'CLEAR', dayType: null, dayTypeId: null, exception: null };
    }

    // mode === 'DAY_TYPE': persist an exception so routine resolution for this
    // date changes to the selected day type.
    if (!dayType) {
      throw new ValidationError('dayType is required for DAY_TYPE mode');
    }

    // A custom day type always stores `dayType: 'CUSTOM'` (the enum has no
    // room for user-defined values) *plus* the `dayTypeId` that identifies
    // which one, so a caller that sends only `dayTypeId` still gets a
    // consistent row.
    const resolvedDefinitionId = dayTypeId ?? null;
    if (resolvedDefinitionId) {
      const definitions = await this.routineService.listDayTypes(userId);
      if (!definitions.some((d) => d.id === resolvedDefinitionId)) {
        throw new ValidationError('Day type not found');
      }
    }

    const exception = await this.routineService.upsertException(userId, {
      date,
      dayType,
      dayTypeId: resolvedDefinitionId,
      templateId: templateId ?? null,
      note: reason ?? null,
    });

    return {
      mode: 'DAY_TYPE',
      dayType,
      dayTypeId: exception.dayTypeId,
      dayTypeName: exception.dayTypeDef?.name ?? null,
      templateId: exception.templateId,
      exception: {
        id: exception.id,
        dayType: exception.dayType,
        dayTypeId: exception.dayTypeId,
        dayTypeName: exception.dayTypeDef?.name ?? null,
        templateId: exception.templateId,
        reason: exception.reason,
      },
    };
  }
}

export const dayModeService = new DayModeService();
