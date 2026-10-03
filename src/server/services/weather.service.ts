import { WeatherRepository } from '@/server/repositories/weather.repository';
import type { weatherLogSchema, weatherQuerySchema } from '@/schemas/wellness.schema';
import type { z } from 'zod';

type WeatherLogInput = z.infer<typeof weatherLogSchema>;
type WeatherQuery = z.infer<typeof weatherQuerySchema>;

/**
 * Weather Service
 *
 * Wellness weather logging (ERROR.md §1).
 *
 * A thin read/upsert over `WeatherRepository`. The upsert semantics are the part
 * worth naming: a weather log is keyed on (user, date), so re-logging a day
 * replaces it rather than appending — otherwise a day the user edited would show
 * two entries and every mood-vs-weather correlation would count it twice.
 */
export class WeatherService {
  private readonly weatherRepository: WeatherRepository;

  constructor(weatherRepository: WeatherRepository = new WeatherRepository()) {
    this.weatherRepository = weatherRepository;
  }

  /** Weather logs for a date range, oldest first. */
  async listForUser(userId: string, query: WeatherQuery) {
    return this.weatherRepository.findByUserId(userId, {
      startDate: query.startDate,
      endDate: query.endDate,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** Create or replace the weather log for a user+date. */
  async log(userId: string, input: WeatherLogInput) {
    return this.weatherRepository.upsert(userId, input);
  }
}

export const weatherService = new WeatherService();
