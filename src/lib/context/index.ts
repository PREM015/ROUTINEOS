// TODO: Implement index.ts
/**
 * Day Context System
 * Manage different day contexts and their effects
 */

export type DayContext =
  | 'NORMAL'
  | 'COLLEGE'
  | 'EXAM'
  | 'TRAVEL'
  | 'SICK'
  | 'LOW_ENERGY'
  | 'BUSY'
  | 'HOLIDAY';

export interface DayContextConfig {
  context: DayContext;
  label: string;
  description: string;
  color: string;
  icon: string;
  suggestedAdjustments: string[];
}

export const DAY_CONTEXTS: Record<DayContext, DayContextConfig> = {
  NORMAL: {
    context: 'NORMAL',
    label: 'Normal Day',
    description: 'Regular day with normal energy and schedule',
    color: '#3b82f6',
    icon: '📅',
    suggestedAdjustments: [],
  },
  COLLEGE: {
    context: 'COLLEGE',
    label: 'College Day',
    description: 'Day with classes and academic commitments',
    color: '#8b5cf6',
    icon: '🎓',
    suggestedAdjustments: [
      'Focus on academic habits',
      'Adjust workout time around classes',
      'Plan study sessions',
    ],
  },
  EXAM: {
    context: 'EXAM',
    label: 'Exam Day',
    description: 'Day with important exam or deadline',
    color: '#ef4444',
    icon: '📝',
    suggestedAdjustments: [
      'Activate minimum day',
      'Skip optional habits',
      'Prioritize sleep',
      'Light exercise only',
    ],
  },
  TRAVEL: {
    context: 'TRAVEL',
    label: 'Travel Day',
    description: 'Day spent traveling or away from home',
    color: '#10b981',
    icon: '✈️',
    suggestedAdjustments: [
      'Use travel-friendly habits',
      'Focus on essential habits only',
      'Adjust routine for timezone',
    ],
  },
  SICK: {
    context: 'SICK',
    label: 'Sick Day',
    description: 'Not feeling well, need rest',
    color: '#f59e0b',
    icon: '🤒',
    suggestedAdjustments: [
      'Activate rest day',
      'Focus on recovery',
      'Skip exercise',
      'Prioritize sleep and hydration',
    ],
  },
  LOW_ENERGY: {
    context: 'LOW_ENERGY',
    label: 'Low Energy',
    description: 'Feeling tired or low energy',
    color: '#6b7280',
    icon: '😴',
    suggestedAdjustments: [
      'Consider minimum day',
      'Lighter workout',
      'Earlier bedtime',
      'Focus on core habits',
    ],
  },
  BUSY: {
    context: 'BUSY',
    label: 'Busy Day',
    description: 'Packed schedule with many commitments',
    color: '#f97316',
    icon: '⚡',
    suggestedAdjustments: [
      'Use minimum day template',
      'Batch similar tasks',
      'Skip time-intensive bonus habits',
    ],
  },
  HOLIDAY: {
    context: 'HOLIDAY',
    label: 'Holiday',
    description: 'Holiday or day off',
    color: '#ec4899',
    icon: '🎉',
    suggestedAdjustments: [
      'Use weekend routine',
      'Focus on personal projects',
      'Flexible schedule',
    ],
  },
};

export function getDayContextConfig(context: DayContext): DayContextConfig {
  return DAY_CONTEXTS[context];
}

export function suggestDayContext(
  energy: number | null,
  mood: number | null,
  stress: number | null,
  currentDate: Date
): DayContext {
  // Check if weekend
  const dayOfWeek = currentDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'HOLIDAY';
  }

  // Check energy and mood
  if (energy && energy <= 2) {
    return 'LOW_ENERGY';
  }

  if (stress && stress >= 4) {
    return 'BUSY';
  }

  if (mood && mood <= 2 && energy && energy <= 2) {
    return 'SICK';
  }

  return 'NORMAL';
}