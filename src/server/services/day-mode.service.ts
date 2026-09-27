import { ScoreRepository } from '@/server/repositories/score.repository';
import { RoutineService } from '@/server/services/routine.service';
import { ScoringService } from '@/server/services/scoring.service';
import { UserService } from '@/server/services/user.service';
import { resolveDayTypeForDate, resolveNaturalDayType } from '@/lib/scheduling/resolve-routine';
import { DEFAULT_TZ } from '@/lib/dates';
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
  naturalDayType: DayType;
  templateId: string | null;
  hasException: boolean;
  exception: {
    id: string;
    dayType: DayType;
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
      naturalDayType: resolveNaturalDayType(date, timezone),
      templateId: resolved.templateId,
      hasException: Boolean(exception),
      exception: exception
        ? {
            id: exception.id,
            dayType: exception.dayType,
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
    const { date, mode, dayType, reason, templateId } = input;

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
      return { mode: 'CLEAR', dayType: null, exception: null };
    }

    // mode === 'DAY_TYPE': persist an exception so routine resolution for this
    // date changes to the selected day type.
    if (!dayType) {
      throw new Error('dayType is required for DAY_TYPE mode');
    }

    const exception = await this.routineService.upsertException(userId, {
      date,
      dayType,
      templateId: templateId ?? null,
      note: reason ?? null,
    });

    return {
      mode: 'DAY_TYPE',
      dayType,
      templateId: exception.templateId,
      exception: {
        id: exception.id,
        dayType: exception.dayType,
        templateId: exception.templateId,
        reason: exception.reason,
      },
    };
  }
}

export const dayModeService = new DayModeService();
