/**
 * Habit Frequency Calculations
 * Calculate habit frequency patterns and metadata
 */

export function getFrequencyLabel(frequencyType: string, frequencyValue?: string | null): string {
  switch (frequencyType) {
    case 'DAILY':
      return 'Every day';

    case 'SPECIFIC_WEEKDAYS':
      return formatWeekdays(frequencyValue);

    case 'WEEKLY_TARGET':
      if (!frequencyValue) return 'Weekly target';
      const perWeek = parseInt(frequencyValue);
      return `${perWeek}x per week`;

    case 'MONTHLY_TARGET':
      if (!frequencyValue) return 'Monthly target';
      const perMonth = parseInt(frequencyValue);
      return `${perMonth}x per month`;

    case 'YEARLY_TARGET':
      if (!frequencyValue) return 'Yearly target';
      const perYear = parseInt(frequencyValue);
      return `${perYear}x per year`;

    case 'RANDOM':
      return 'Whenever you want';

    case 'ONE_TIME':
      return 'One time';

    case 'CUSTOM':
      return 'Custom schedule';

    default:
      return 'Unknown';
  }
}

function formatWeekdays(value?: string | null): string {
  if (!value) return 'No days';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdays = value.split(',').map(Number);

  if (weekdays.length === 7) {
    return 'Every day';
  }

  if (weekdays.length === 5 && JSON.stringify(weekdays) === JSON.stringify([1, 2, 3, 4, 5])) {
    return 'Weekdays';
  }

  if (weekdays.length === 2 && JSON.stringify(weekdays) === JSON.stringify([0, 6])) {
    return 'Weekends';
  }

  return weekdays.map(d => dayNames[d]).join(', ');
}

export function calculateCompletionTarget(
  frequencyType: string,
  frequencyValue?: string | null,
  period: 'week' | 'month' | 'year' = 'month'
): number {
  switch (frequencyType) {
    case 'DAILY':
      if (period === 'week') return 7;
      if (period === 'month') return 30;
      if (period === 'year') return 365;
      return 30;

    case 'SPECIFIC_WEEKDAYS':
      if (!frequencyValue) return 0;
      const weekdaysCount = frequencyValue.split(',').length;
      if (period === 'week') return weekdaysCount;
      if (period === 'month') return Math.ceil((weekdaysCount / 7) * 30);
      if (period === 'year') return weekdaysCount * 52;
      return weekdaysCount * 4;

    case 'WEEKLY_TARGET':
      if (!frequencyValue) return 0;
      const perWeek = parseInt(frequencyValue);
      if (period === 'week') return perWeek;
      if (period === 'month') return Math.ceil(perWeek * 4.3);
      if (period === 'year') return perWeek * 52;
      return perWeek * 4;

    case 'MONTHLY_TARGET':
      if (!frequencyValue) return 0;
      const perMonth = parseInt(frequencyValue);
      if (period === 'month') return perMonth;
      if (period === 'year') return perMonth * 12;
      return Math.ceil(perMonth / 4);

    case 'YEARLY_TARGET':
      if (!frequencyValue) return 0;
      return parseInt(frequencyValue);

    default:
      return 0;
  }
}