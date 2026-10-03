import { HealthMetricRepository } from '@/server/repositories/health-metric.repository';
import { NotFoundError } from '@/lib/errors/app-error';
import type {
  HealthMetricInput,
  HealthMetricQueryParams,
  UpdateHealthMetricInput,
} from '@/schemas/health-metric.schema';
import type { HealthMetric } from '@/generated/prisma';

/**
 * Health Metric Service
 *
 * CRUD for `HealthMetric` (ERROR.md §1).
 *
 * A pure pass-through, which is the point: there is no orchestration in these
 * routes, so the only thing this service adds is a single place where the
 * "belongs to this user" check lives. That check was previously written out
 * three times in the `[id]` route — once before GET, once before PATCH and once
 * before DELETE — and the DELETE copy had drifted, returning a bare 500 where
 * the other two returned the server's 404.
 */
export class HealthMetricService {
  private readonly healthMetricRepository: HealthMetricRepository;

  constructor(
    healthMetricRepository: HealthMetricRepository = new HealthMetricRepository()
  ) {
    this.healthMetricRepository = healthMetricRepository;
  }

  /** Metrics for the user, filtered by the given query. */
  async listForUser(userId: string, query: HealthMetricQueryParams) {
    return this.healthMetricRepository.findAll(userId, query);
  }

  /** Record a metric. */
  async create(userId: string, input: HealthMetricInput): Promise<HealthMetric> {
    return this.healthMetricRepository.create(userId, input);
  }

  /** One metric, or `NotFoundError`. */
  async getForUser(userId: string, metricId: string): Promise<HealthMetric> {
    const metric = await this.healthMetricRepository.findById(userId, metricId);
    if (!metric) {
      throw new NotFoundError('Health metric');
    }
    return metric;
  }

  /**
   * Update a metric.
   *
   * An empty patch returns the existing row without writing, matching the
   * behaviour these routes have always had. A client PATCHing `{}` on save is not
   * making a mistake worth a database write and an updatedAt bump.
   */
  async update(
    userId: string,
    metricId: string,
    input: UpdateHealthMetricInput
  ): Promise<HealthMetric> {
    const existing = await this.getForUser(userId, metricId);

    if (Object.keys(input).length === 0) {
      return existing;
    }

    return this.healthMetricRepository.update(userId, metricId, input);
  }

  /** Delete a metric. */
  async delete(userId: string, metricId: string): Promise<void> {
    await this.getForUser(userId, metricId);
    await this.healthMetricRepository.delete(userId, metricId);
  }
}

export const healthMetricService = new HealthMetricService();
