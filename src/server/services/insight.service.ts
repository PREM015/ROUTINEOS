import { InsightRepository } from '@/server/repositories/insight.repository';
import { aggregateUserDataForAI, validateDataSize } from '@/server/ai/aggregator';
import { generateInsight, estimateCost } from '@/server/ai/provider';
import type { InsightPeriod } from '@/generated/prisma';

/**
 * Insight Service (read/generate entry points for the API)
 *
 * Owns the "have we already generated this period?" cache check, the data-size
 * guard and persistence of the generated insight. All of that previously lived
 * in the API route, so it could not be reused or tested independently.
 */

/** Maximum payload handed to the model. */
export const MAX_INSIGHT_DATA_KB = 50;

/**
 * Periods the AI provider can actually generate for. The Prisma
 * `InsightPeriod` enum is wider (it also has QUARTERLY), so the narrower union
 * is used here to keep the type honest at the call boundary.
 */
export type GeneratableInsightPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export class InsightReadService {
  private insightRepository: InsightRepository;

  constructor() {
    this.insightRepository = new InsightRepository();
  }

  /**
   * The user's most recent insight, optionally scoped to a period.
   */
  async getLatestInsight(
    userId: string,
    period?: InsightPeriod
  ) {
    return this.insightRepository.findLatest(userId, period ? { period } : {});
  }

  /**
   * Insights generated within an inclusive calendar window, newest first.
   */
  async getInsightHistory(
    userId: string,
    startDate: string,
    endDate: string
  ) {
    const rows = await this.insightRepository.findHistory(userId, startDate, endDate);

    // `dataSnapshot` is the raw prompt payload — potentially large and never
    // needed by a history list. It is deliberately not projected out.
    return rows.map((row) => ({
      id: row.id,
      period: row.period,
      startDate: row.startDate,
      endDate: row.endDate,
      summary: row.summary,
      wins: row.wins,
      patterns: row.patterns,
      concerns: row.concerns,
      suggestions: row.suggestions,
      nextPeriodFocus: row.nextPeriodFocus,
      model: row.model,
      tokensUsed: row.tokensUsed,
      wasHelpful: row.wasHelpful,
      userRating: row.userRating,
      userFeedback: row.userFeedback,
      generatedAt: row.generatedAt,
    }));
  }
}

export class InsightGenerationService {
  private insightRepository: InsightRepository;

  constructor() {
    this.insightRepository = new InsightRepository();
  }

  /**
   * Generate (or return the cached) insight for a period.
   *
   * @throws when the aggregated payload exceeds {@link MAX_INSIGHT_DATA_KB}.
   */
  async generate(
    userId: string,
    input: { period: GeneratableInsightPeriod; startDate: string; endDate: string }
  ): Promise<{ insight: unknown; cost: string; cached: boolean }> {
    const { period, startDate, endDate } = input;

    // Reuse an identical, already-generated insight rather than paying twice.
    const existing = await this.insightRepository.findLatest(userId, {
      period,
      startDate,
      endDate,
    });
    if (existing) {
      return { insight: existing, cost: '0.0000', cached: true };
    }

    const data = await aggregateUserDataForAI(userId, startDate, endDate);

    const validation = validateDataSize(data);
    if (!validation.valid) {
      throw new Error(
        `Data too large: ${validation.size.toFixed(2)}KB (max ${MAX_INSIGHT_DATA_KB}KB)`
      );
    }

    const generated = await generateInsight(data, period);
    const cost = estimateCost(generated.tokensUsed, generated.model);

    const saved = await this.insightRepository.create({
      userId,
      period,
      startDate,
      endDate,
      dataSnapshot: JSON.stringify(data),
      model: generated.model,
      tokensUsed: generated.tokensUsed,
      summary: generated.summary,
      wins: generated.wins.join('\n'),
      patterns: generated.patterns.join('\n'),
      concerns: generated.concerns.join('\n'),
      suggestions: generated.suggestions.join('\n'),
      nextPeriodFocus: generated.nextPeriodFocus,
    });

    return { insight: saved, cost: cost.toFixed(4), cached: false };
  }
}

export const insightReadService = new InsightReadService();
export const insightGenerationService = new InsightGenerationService();
