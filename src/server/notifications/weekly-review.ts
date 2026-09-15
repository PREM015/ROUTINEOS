export function buildWeeklyReviewReminder(weekStart: string): { title: string; body: string } {
  return {
    title: 'Weekly Review Time',
    body: `It's time to review your week starting ${weekStart}.`
  };
}

export function getWeeklyReviewScheduleTime(preferredDay: string = 'Sunday', preferredTime: string = '17:00'): Date {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayIndex = days.indexOf(preferredDay) !== -1 ? days.indexOf(preferredDay) : 0;
  const now = new Date();
  const currentDay = now.getDay();
  let diff = dayIndex - currentDay;
  if (diff < 0) diff += 7;
  const scheduledDate = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
  const [hh, mm] = preferredTime.split(':').map(Number);
  scheduledDate.setHours(hh || 17, mm || 0, 0, 0);
  return scheduledDate;
}
