import { GoalRepository } from '@/server/repositories/goal.repository';
import type { AllGoalsAnalytics } from '@/types/analytics';

/**
 * Goals Analytics
 * Calculate comprehensive goal statistics
 */

const goalRepository = new GoalRepository();

export async function getAllGoalsAnalytics(
  userId: string,
  startDate: string,
  endDate: string
): Promise<AllGoalsAnalytics> {
  const allGoals = await goalRepository.findAll(userId, {});

  const activeGoals = allGoals.filter(g => 
    new Date(g.startDate) <= new Date(endDate) &&
    new Date(g.endDate) >= new Date(startDate)
  );

  // Count by status
  const byStatus = activeGoals.reduce((acc, goal) => {
    const status = goal.status;
    const existing = acc.find(s => s.status === status);
    if (existing) {
      existing.count++;
      existing.percentage = (existing.count / activeGoals.length) * 100;
    } else {
      acc.push({
        status,
        count: 1,
        percentage: (1 / activeGoals.length) * 100,
      });
    }
    return acc;
  }, [] as Array<{ status: string; count: number; percentage: number }>);

  // Count by type
  const byType = activeGoals.reduce((acc, goal) => {
    const type = goal.type;
    const existing = acc.find(t => t.type === type);
    
    const progress = (goal.currentValue / goal.targetValue) * 100;
    
    if (existing) {
      existing.count++;
      existing.totalProgress += progress;
      existing.completionRate = existing.count > 0 
        ? (activeGoals.filter(g => g.type === type && g.status === 'COMPLETED').length / existing.count) * 100
        : 0;
      existing.averageProgress = existing.totalProgress / existing.count;
    } else {
      acc.push({
        type,
        count: 1,
        completionRate: goal.status === 'COMPLETED' ? 100 : 0,
        totalProgress: progress,
        averageProgress: progress,
      });
    }
    return acc;
  }, [] as Array<{ type: string; count: number; completionRate: number; totalProgress: number; averageProgress: number }>);

  // Calculate performance
  const now = new Date();
  const onTrack = activeGoals.filter(goal => {
    if (goal.status !== 'ACTIVE') return false;
    
    const progress = (goal.currentValue / goal.targetValue) * 100;
    const timeProgress = ((now.getTime() - new Date(goal.startDate).getTime()) / 
      (new Date(goal.endDate).getTime() - new Date(goal.startDate).getTime())) * 100;
    
    return progress >= timeProgress * 0.9; // On track if at least 90% of expected progress
  }).length;

  const atRisk = activeGoals.filter(goal => {
    if (goal.status !== 'ACTIVE') return false;
    
    const progress = (goal.currentValue / goal.targetValue) * 100;
    const timeProgress = ((now.getTime() - new Date(goal.startDate).getTime()) / 
      (new Date(goal.endDate).getTime() - new Date(goal.startDate).getTime())) * 100;
    
    return progress < timeProgress * 0.9 && progress >= timeProgress * 0.5;
  }).length;

  const overdue = activeGoals.filter(goal => 
    goal.status === 'ACTIVE' && new Date(goal.endDate) < now
  ).length;

  const completed = activeGoals.filter(g => g.status === 'COMPLETED').length;

  const averageProgress = activeGoals.length > 0
    ? activeGoals.reduce((sum, g) => sum + ((g.currentValue / g.targetValue) * 100), 0) / activeGoals.length
    : 0;

  // Top goals by velocity
  const topGoals = activeGoals
    .filter(g => g.status === 'ACTIVE')
    .map(goal => {
      const daysElapsed = Math.max(1, Math.ceil(
        (now.getTime() - new Date(goal.startDate).getTime()) / (1000 * 60 * 60 * 24)
      ));
      const velocity = goal.currentValue / daysElapsed;
      
      return {
        goalId: goal.id,
        title: goal.title,
        progress: (goal.currentValue / goal.targetValue) * 100,
        velocity,
      };
    })
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 5);

  return {
    period: { startDate, endDate },
    totalGoals: activeGoals.length,
    byStatus,
    byType,
    performance: {
      onTrack,
      atRisk,
      overdue,
      completed,
      averageProgress: Math.round(averageProgress * 100) / 100,
      averageVelocity: 0, // Would need historical data
    },
    topGoals,
  };
}