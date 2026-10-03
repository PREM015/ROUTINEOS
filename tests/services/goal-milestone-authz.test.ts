/**
 * Milestone ownership gating.
 *
 * `GoalRepository.setMilestoneCompleted` and `deleteMilestone` take only a
 * milestone id — there is no `userId` on the model to check against. Routing a
 * caller-supplied id straight into them would let anyone tick or delete any
 * milestone in the database. These pin the gate that closes that: the goal is
 * loaded scoped to the caller *and* the milestone must belong to that goal.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/server/repositories/goal.repository', () => ({
  GoalRepository: vi.fn().mockImplementation(() => repositoryMock),
}));
vi.mock('@/server/repositories/project.repository', () => ({
  ProjectRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/server/repositories/task.repository', () => ({
  TaskRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/server/repositories/achievement.repository', () => ({
  AchievementRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/server/audit/audit.service', () => ({
  AuditService: vi.fn().mockImplementation(() => ({
    log: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('@/server/services/achievement.service', () => ({
  AchievementService: vi.fn().mockImplementation(() => ({ checkAndUnlock: vi.fn() })),
}));
vi.mock('@/lib/prisma', () => ({ default: {} }));

import { GoalService } from '@/server/services/goal.service';
import { NotFoundError } from '@/lib/errors/app-error';

const USER = 'user_1';
const GOAL = 'goal_a';
const MILESTONE = 'ms_1';

const repositoryMock = {
  findById: vi.fn(),
  getMilestones: vi.fn(),
  setMilestoneCompleted: vi.fn().mockResolvedValue({ id: MILESTONE }),
  deleteMilestone: vi.fn().mockResolvedValue(undefined),
};

describe('GoalService milestone writes - ownership', () => {
  let service: GoalService;

  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.findById.mockResolvedValue({ id: GOAL, userId: USER });
    repositoryMock.getMilestones.mockResolvedValue([{ id: MILESTONE }]);
    service = new GoalService();
  });

  it('completes a milestone that belongs to the goal', async () => {
    await service.setMilestoneComplete(USER, GOAL, MILESTONE, true);

    expect(repositoryMock.setMilestoneCompleted).toHaveBeenCalledWith(
      MILESTONE,
      expect.any(Date)
    );
  });

  it('clears completedAt when reopening', async () => {
    await service.setMilestoneComplete(USER, GOAL, MILESTONE, false);

    // Not a "delete and recreate": the description and due date survive.
    expect(repositoryMock.setMilestoneCompleted).toHaveBeenCalledWith(MILESTONE, null);
  });

  it('refuses a milestone that exists but under a different goal', async () => {
    // The goal is the caller's, but the milestone id belongs to someone else's
    // goal. Checking only that the goal is owned would let this through.
    repositoryMock.getMilestones.mockResolvedValue([{ id: 'ms_other' }]);

    await expect(
      service.setMilestoneComplete(USER, GOAL, 'ms_someone_elses', true)
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(repositoryMock.setMilestoneCompleted).not.toHaveBeenCalled();
  });

  it('refuses to delete a milestone belonging to another goal', async () => {
    repositoryMock.getMilestones.mockResolvedValue([{ id: 'ms_other' }]);

    await expect(
      service.deleteMilestone(USER, GOAL, 'ms_someone_elses')
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(repositoryMock.deleteMilestone).not.toHaveBeenCalled();
  });

  it('refuses everything when the goal itself is not the caller\'s', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    await expect(
      service.setMilestoneComplete(USER, 'goal_not_mine', MILESTONE, true)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.deleteMilestone(USER, 'goal_not_mine', MILESTONE)
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(repositoryMock.setMilestoneCompleted).not.toHaveBeenCalled();
    expect(repositoryMock.deleteMilestone).not.toHaveBeenCalled();
  });
});