export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 90, 180, 365];

export function checkNewMilestone(oldStreak: number, newStreak: number): number | null {
  for (const milestone of STREAK_MILESTONES.slice().reverse()) {
    if (newStreak >= milestone && oldStreak < milestone) {
      return milestone;
    }
  }
  return null;
}

export function getMilestoneMessage(days: number): string {
  return `You've reached a ${days}-day streak!`;
}

export function getMilestoneEmoji(days: number): string {
  if (days >= 365) return '👑';
  if (days >= 180) return '💎';
  if (days >= 90) return '🔥';
  if (days >= 30) return '🌟';
  return '✨';
}
