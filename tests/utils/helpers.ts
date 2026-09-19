import { getTodayString } from '../../src/lib/dates';

export function d(iso: string): Date {
  return new Date(iso);
}

export function todayIso(): string {
  return getTodayString();
}

export function nDaysAgo(n: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - n);
  return date.toISOString().slice(0, 10);
}

export function daysFromNow(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function uniqueId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}