/**
 * Carry-over milestone copying.
 *
 * The behaviour this pins is the reason carry-over exists at all: a goal carried
 * over for missing its deadline must arrive in the new period with its plan
 * intact. Copying a bare `0 / 100` with no steps produces the same abandoned
 * goal a second time.
 *
 * Repository and service collaborators are mocked, so these run with no
 * `DATABASE_URL`.
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

const USER = 'user_1';
const GOAL = 'goal_a';

const repositoryMock = {
  findById: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  create: vi.fn(),
  createMilestones: vi.fn().mockResolvedValue(0),
  getMilestones: vi.fn(),
  findWithRelations: vi.fn().mockResolvedValue({ id: 'goal_new' }),
};

const EXISTING_MILESTONES = [
  {
    id: 'ms_1',
    title: 'Draft the proposal',
    description: 'outline plus budget',
    targetValue: null,
    dueDate: null,
    sortOrder: 0,
    completedAt: null,
  },
  {
    id: 'ms_2',
    // Already ticked. The one that matters: a carried-over goal is late, so it
    // should not start the next period with a completed final step.
    title: 'Ship it',
    description: null,
    targetValue: null,
    dueDate: null,
    sortOrder: 1,
    completedAt: new Date('2026-01-05'),
  },
];

describe('GoalService.carryOverGoal', () => {
  let service: GoalService;

  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.create.mockImplementation(({ data }: { data: { carriedOverFrom: string } }) =>
      Promise.resolve({ id: 'goal_new', ...data })
    );
    service = new GoalService();
  });

  it('archives the original and links the copy back to it', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: GOAL,
      userId: USER,
      title: 'Run a marathon',
      description: null,
      type: 'YEARLY',
      priority: 'HIGH',
      status: 'ACTIVE',
      targetValue: 42,
      currentValue: 12,
      unit: 'km',
      projectId: null,
    });
    repositoryMock.getMilestones.mockResolvedValue(EXISTING_MILESTONES);

    await service.carryOverGoal(USER, GOAL, new Date('2026-03-01'), false);

    expect(repositoryMock.update).toHaveBeenCalledWith(GOAL, USER, {
      status: 'CARRIED_OVER',
    });
    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        carriedOverFrom: GOAL,
        title: 'Run a marathon',
      })
    );
  });

  it('copies milestones as OPEN steps, keeping their order', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: GOAL,
      userId: USER,
      title: 'Run a marathon',
      description: null,
      type: 'YEARLY',
      priority: 'HIGH',
      status: 'ACTIVE',
      targetValue: 42,
      currentValue: 12,
      unit: 'km',
      projectId: null,
    });
    repositoryMock.getMilestones.mockResolvedValue(EXISTING_MILESTONES);

    await service.carryOverGoal(USER, GOAL, new Date('2026-03-01'), false);

    expect(repositoryMock.createMilestones).toHaveBeenCalledTimes(1);
    const [rows] = repositoryMock.createMilestones.mock.calls[0];

    expect(rows).toHaveLength(2);
    // `completedAt` is absent entirely rather than null, so the column keeps its
    // own default and the copy can never read as completed.
    expect(rows.every((r: Record<string, unknown>) => !('completedAt' in r))).toBe(true);
    expect(rows.map((r: { title: string }) => r.title)).toEqual([
      'Draft the proposal',
      'Ship it',
    ]);
    expect(rows.map((r: { sortOrder: number }) => r.sortOrder)).toEqual([0, 1]);
    expect(rows[0].goalId).toBe('goal_new');
  });

  it('skips the copy entirely when the goal has no milestones', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: GOAL,
      userId: USER,
      title: 'Read more',
      description: null,
      type: 'YEARLY',
      priority: 'LOW',
      status: 'ACTIVE',
      targetValue: 12,
      currentValue: 0,
      unit: 'books',
      projectId: null,
    });
    repositoryMock.getMilestones.mockResolvedValue([]);

    await service.carryOverGoal(USER, GOAL, new Date('2026-03-01'), false);

    // An empty `createMany` is a wasted round trip on every milestone-free
    // carry-over.
    expect(repositoryMock.createMilestones).not.toHaveBeenCalled();
  });

  it('restarts at zero by default and keeps progress only when asked', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: GOAL,
      userId: USER,
      title: 'Run a marathon',
      description: null,
      type: 'YEARLY',
      priority: 'HIGH',
      status: 'ACTIVE',
      targetValue: 42,
      currentValue: 12,
      unit: 'km',
      projectId: null,
    });
    repositoryMock.getMilestones.mockResolvedValue([]);

    await service.carryOverGoal(USER, GOAL, new Date('2026-03-01'), false);
    expect(repositoryMock.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentValue: 0 })
    );

    await service.carryOverGoal(USER, GOAL, new Date('2026-03-01'), true);
    expect(repositoryMock.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentValue: 12 })
    );
  });

  it('throws rather than carrying a goal the caller does not own', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    await expect(
      service.carryOverGoal(USER, 'goal_not_mine', new Date('2026-03-01'), false)
    ).rejects.toThrow(/not found/i);

    expect(repositoryMock.update).not.toHaveBeenCalled();
    expect(repositoryMock.create).not.toHaveBeenCalled();
  });
});