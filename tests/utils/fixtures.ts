import { DEFAULT_TEMPLATES, TEMPLATE_CATEGORIES } from '../../src/lib/constants/templates';

export function templateCategories() {
  return TEMPLATE_CATEGORIES;
}

export function defaultTemplates() {
  return DEFAULT_TEMPLATES;
}

export function morningRoutineFixture() {
  return DEFAULT_TEMPLATES[0] ?? null;
}

export function energySampleSeries() {
  return [
    { date: '2026-09-15', time: '09:00', energy: 5 },
    { date: '2026-09-16', time: '09:00', energy: 4 },
    { date: '2026-09-17', time: '09:00', energy: 5 },
  ];
}

export function moodLogSeries() {
  return [
    { date: '2026-09-15', mood: 3 },
    { date: '2026-09-16', mood: 3 },
    { date: '2026-09-17', mood: 4 },
  ];
}

export function sleepLogFixture() {
  return {
    date: '2026-09-15',
    actualBedtime: '23:00',
    actualWakeTime: '06:30',
    durationMinutes: 450,
    quality: 4,
  };
}