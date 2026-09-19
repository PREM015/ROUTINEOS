import { format, parseISO } from 'date-fns';
import { describe, expect, it } from 'vitest';

import {
  calculateSleepWindow,
  formatMinutes,
  getDayOfWeek,
  getDaysRemaining,
  getMonthDays,
  getPastNDays,
  getTodayString,
  getWeekDays,
  getWeekRange,
  hasSleepConflict,
  isSameDayStr,
  timeToMinutes,
} from '../../src/lib/dates';
import { makeMonth, makeSleepMidnight } from '../utils/db';

describe('date helpers', () => {
  describe('week range helpers', () => {
    it('returns the Monday-to-Sunday week containing the date', () => {
      expect(getWeekRange('2026-09-17')).toEqual({
        start: '2026-09-14',
        end: '2026-09-20',
      });
    });

    it('honors weekStartsOn=0 for a Sunday start', () => {
      expect(getWeekRange('2026-09-17', 0)).toEqual({
        start: '2026-09-13',
        end: '2026-09-19',
      });
    });

    it('getWeekDays returns every day of the week', () => {
      expect(getWeekDays('2026-09-17')).toEqual([
        '2026-09-14',
        '2026-09-15',
        '2026-09-16',
        '2026-09-17',
        '2026-09-18',
        '2026-09-19',
        '2026-09-20',
      ]);
      expect(getWeekDays('2026-09-17', 0)).toHaveLength(7);
    });
  });

  describe('month helpers', () => {
    it('returns 28 days for February 2026', () => {
      const days = getMonthDays(2026, 2);
      expect(days).toHaveLength(28);
      expect(days[0]).toBe('2026-02-01');
      expect(days[27]).toBe('2026-02-28');
    });

    it('returns 29 days for leap February 2024', () => {
      expect(getMonthDays(2024, 2)).toHaveLength(29);
    });
  });

  describe('time helpers', () => {
    it('converts HH:mm to minutes since midnight', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('06:30')).toBe(390);
      expect(timeToMinutes('23:00')).toBe(1380);
    });

    it('computes overnight sleep windows correctly', () => {
      expect(calculateSleepWindow('23:00', '06:30')).toBe(450);
      expect(calculateSleepWindow('06:30', '22:00')).toBe(930);
    });

    it('flags sleep conflicts when the window is too short', () => {
      expect(hasSleepConflict('23:00', '06:30', 480)).toBe(true);
      expect(hasSleepConflict('23:00', '06:30', 450)).toBe(false);
    });

    it('formats minutes as hours and minutes', () => {
      expect(formatMinutes(120)).toBe('2h');
      expect(formatMinutes(90)).toBe('1h 30m');
      expect(formatMinutes(0)).toBe('0h');
      expect(formatMinutes(35)).toBe('0h 35m');
    });
  });

  describe('date strings', () => {
    it('returns today in ISO format and compares day strings', () => {
      expect(getTodayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isSameDayStr('2026-09-17', '2026-09-17')).toBe(true);
      expect(isSameDayStr('2026-09-17', '2026-09-18')).toBe(false);
    });

    it('returns the localized day name for a date', () => {
      expect(getDayOfWeek('2026-09-17')).toBe(format(parseISO('2026-09-17'), 'EEEE'));
    });

    it('clamps days-remaining to zero for past dates', () => {
      expect(getDaysRemaining('2000-01-01')).toBe(0);
      expect(getDaysRemaining('2099-12-31')).toBeGreaterThan(25_000);
    });

    it('getPastNDays returns the requested window of ISO dates', () => {
      const days = getPastNDays(5);
      expect(days).toHaveLength(5);
      for (const day of days) {
        expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect([...days].sort()).toEqual(days);
    });
  });

  describe('db fixtures', () => {
    it('exposes month fixtures keyed by month', () => {
      const month = makeMonth({ month: 2 });
      expect(month.month).toBe(2);
      expect(month.monthKey).toBe('2026-01');
      expect(makeMonth({ isCompleted: true }).isCompleted).toBe(true);
    });

    it('exposes sleep fixtures that respect midnight boundaries', () => {
      const sleep = makeSleepMidnight({ date: '2026-09-17', durationMinutes: 300 });
      expect(sleep.isSleepMidnight).toBe(true);
      expect(sleep.durationMinutes).toBe(300);
    });
  });
});