/**
 * Sub-goal hierarchy cycle guard.
 *
 * `Goal.parentGoalId` is a self-relation and the database will accept a cycle —
 * `assertValidParent` is the only thing standing between the API and an
 * infinitely-deep tree that hangs every recursive read. These tests pin the three
 * cases that matter: self-parent, parent-is-a-descendant, and the two shapes that
 * must still be allowed (a genuine re-parent upward, and a detach).
 *
 * The repository is mocked rather than the database, so these run with no
 * `DATABASE_URL` — see `vitest.config.ts`, which aliases `@/generated/prisma`.
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
  AuditService: vi.fn().mockImplementation(() => ({ log: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('@/server/services/achievement.service', () => ({
  AchievementService: vi.fn().mockImplementation(() => ({ checkAndUnlock: vi.fn() })),
}));

vi.mock('@/server/services/scoring.service', () => ({
  ScoringService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@/lib/prisma', () => ({ default: {} }));

import { GoalService } from '@/server/services/goal.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';

const repositoryMock = {
  findById: vi.fn(),
  findDescendantIds: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  findWithRelations: vi.fn().mockResolvedValue({}),
};

const USER = 'user_1';
const GOAL = 'goal_a';
const PARENT = 'goal_p';

/** Minimal goal row; `updateGoal` reads almost nothing from it. */
function goalRow(id: string) {
  return {
    id,
    userId: USER,
    title: `Goal ${id}`,
    status: 'ACTIVE',
    currentValue: 5,
    targetValue: 10,
  };
}

describe('GoalService.updateGoal - sub-goal hierarchy', () => {
  let service: GoalService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoalService();
  });

  it('rejects a goal being made its own parent', async () => {
    repositoryMock.findById.mockResolvedValue(goalRow(GOAL));
    // findDescendantIds is deliberately not consulted: the self-case is caught
    // before the tree walk, so a walk here would be wasted work per request.
    repositoryMock.findDescendantIds.mockClear();

    await expect(
      service.updateGoal(USER, GOAL, { parentGoalId: GOAL })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(repositoryMock.findDescendantIds).not.toHaveBeenCalled();
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('rejects a parent that is one of the goal\'s own descendants', async () => {
    repositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve(id === GOAL ? goalRow(GOAL) : goalRow(PARENT))
    );
    // PARENT is a child of GOAL, so making PARENT the parent of GOAL closes the
    // loop GOAL -> ... -> PARENT -> GOAL.
    repositoryMock.findDescendantIds.mockResolvedValue([PARENT, 'goal_b']);

    await expect(
      service.updateGoal(USER, GOAL, { parentGoalId: PARENT })
    ).rejects.toThrow(/cannot sit above its own sub-goal/);

    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('rejects a parent belonging to another user, as not-found rather than forbidden', async () => {
    repositoryMock.findById.mockImplementation((id: string) =>
      // findById is scoped by userId, so a foreign parent simply does not resolve.
      Promise.resolve(id === GOAL ? goalRow(GOAL) : null)
    );

    await expect(
      service.updateGoal(USER, GOAL, { parentGoalId: 'goal_someone_else' })
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('allows re-parenting under an unrelated goal', async () => {
    repositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve(id === GOAL ? goalRow(GOAL) : goalRow(PARENT))
    );
    repositoryMock.findDescendantIds.mockResolvedValue([]);
    repositoryMock.update.mockResolvedValue(undefined);

    await service.updateGoal(USER, GOAL, { parentGoalId: PARENT });

    expect(repositoryMock.update).toHaveBeenCalledWith(
      GOAL,
      USER,
      expect.objectContaining({ parentGoal: { connect: { id: PARENT } } })
    );
  });

  it('detaches on null without consulting the tree at all', async () => {
    repositoryMock.findById.mockResolvedValue(goalRow(GOAL));
    repositoryMock.findDescendantIds.mockClear();

    await service.updateGoal(USER, GOAL, { parentGoalId: null });

    // A detach cannot create a cycle, so the descendant walk is skipped.
    expect(repositoryMock.findDescendantIds).not.toHaveBeenCalled();
    expect(repositoryMock.update).toHaveBeenCalledWith(
      GOAL,
      USER,
      expect.objectContaining({ parentGoal: { disconnect: true } })
    );
  });

  it('leaves the parent untouched when parentGoalId is absent', async () => {
    repositoryMock.findById.mockResolvedValue(goalRow(GOAL));
    repositoryMock.findDescendantIds.mockClear();

    await service.updateGoal(USER, GOAL, { title: 'Renamed' });

    // Not passing the field is not the same as passing null, and must not
    // detach a goal that happens to be a sub-goal.
    expect(repositoryMock.findDescendantIds).not.toHaveBeenCalled();
    const [, , patch] = repositoryMock.update.mock.calls[0];
    expect(patch).not.toHaveProperty('parentGoal');
  });
});