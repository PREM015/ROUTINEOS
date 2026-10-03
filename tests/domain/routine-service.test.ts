import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Service-level tests for `RoutineService`.
 *
 * Every repository and the scoring service are mocked, so this file runs in the
 * repo's `node` Vitest environment with **no database and no `DATABASE_URL`**.
 * That matters: `RoutineRepository` extends `BaseRepository`, which imports
 * `@/lib/prisma`, which throws at import time when the env var is absent. So the
 * mocks below are not a convenience, they are the only way to test a service
 * here at all.
 *
 * Each test pins a behaviour that was previously wrong, or a rule with no
 * second implementation anywhere to catch it drifting.
 */

const routineRepository = {
  findTemplateById: vi.fn(),
  findTemplateWithBlocks: vi.fn(),
  findTemplateByDayType: vi.fn(),
findTemplateByDayTypeId: vi.fn(),
  findDayTypeDefinitionById: vi.fn(),
  findDayTypeDefinitionBySlug: vi.fn(),
  listExceptions: vi.fn(),
  upsertExceptions: vi.fn(),
  findBlocksByTemplate: vi.fn(),
  maxSortOrderForTemplate: vi.fn(),
  createBlock: vi.fn(),
  findBlockById: vi.fn(),
  findBlockByIdForService: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
  deleteTemplate: vi.fn(),
  findLogsByDate: vi.fn(),
  upsertLog: vi.fn(),
  deleteLog: vi.fn(),
findException: vi.fn(),
  findRecentRatedLogs: vi.fn(),
};

const categoryRepository = { findById: vi.fn() };
const scoreRepository = { findByDate: vi.fn() };
const userRepository = { getSettings: vi.fn() };

const recalculateDate = vi.fn(async () => ({}));

vi.mock('@/server/repositories/routine.repository', () => ({
  RoutineRepository: class {
    findTemplateById = routineRepository.findTemplateById;
    findTemplateWithBlocks = routineRepository.findTemplateWithBlocks;
    findTemplateByDayType = routineRepository.findTemplateByDayType;
    findTemplateByDayTypeId = routineRepository.findTemplateByDayTypeId;
    findDayTypeDefinitionById = routineRepository.findDayTypeDefinitionById;
    findDayTypeDefinitionBySlug = routineRepository.findDayTypeDefinitionBySlug;
    listExceptions = routineRepository.listExceptions;
    upsertExceptions = routineRepository.upsertExceptions;
    findBlocksByTemplate = routineRepository.findBlocksByTemplate;
    maxSortOrderForTemplate = routineRepository.maxSortOrderForTemplate;
    createBlock = routineRepository.createBlock;
    findBlockById = routineRepository.findBlockById;
    findBlockByIdForService = routineRepository.findBlockByIdForService;
    updateBlock = routineRepository.updateBlock;
    deleteBlock = routineRepository.deleteBlock;
    deleteTemplate = routineRepository.deleteTemplate;
    findLogsByDate = routineRepository.findLogsByDate;
    upsertLog = routineRepository.upsertLog;
    deleteLog = routineRepository.deleteLog;
    findException = routineRepository.findException;
    findRecentRatedLogs = routineRepository.findRecentRatedLogs;
  },
}));

vi.mock('@/server/repositories/category.repository', () => ({
  CategoryRepository: class {
    findById = categoryRepository.findById;
  },
}));

vi.mock('@/server/repositories/score.repository', () => ({
  ScoreRepository: class {
    findByDate = scoreRepository.findByDate;
  },
}));

vi.mock('@/server/repositories/user.repository', () => ({
  UserRepository: class {
    getSettings = userRepository.getSettings;
  },
}));

vi.mock('@/server/services/scoring.service', () => ({
  ScoringService: class {
    recalculateDate = recalculateDate;
    calculateDailyScore = vi.fn(async () => ({}));
  },
}));

import { RoutineService } from '@/server/services/routine.service';
import { EditWindowError } from '@/lib/routine/edit-window';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';

const USER = 'user-1';
const TEMPLATE_ID = 'tpl-1';

function storedBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'blk-1',
    userId: USER,
    templateId: TEMPLATE_ID,
    startTime: '09:00',
    endTime: '10:00',
    isOvernight: false,
    title: 'Deep work',
    description: null,
    notes: null,
    sortOrder: 0,
    color: null,
    icon: null,
    categoryId: null,
    energyLevel: null,
    trackCompletion: true,
    isRecurring: true,
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE_ID,
    userId: USER,
    name: 'Workday',
    dayType: 'CUSTOM',
    dayTypeId: 'dt-1',
    isDefault: false,
    isActive: true,
    blocks: [],
    exceptions: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userRepository.getSettings.mockResolvedValue({
    timezone: 'UTC',
    retroactiveEditDays: 3,
  });
  scoreRepository.findByDate.mockResolvedValue(null);
routineRepository.findException.mockResolvedValue(null);
  routineRepository.findLogsByDate.mockResolvedValue([]);
  // Defaults for the day-type → definition → template chain. `getRoutineForDate`
  // resolves a NATURAL day type's definition by slug before it can match a
  // template, so a bare `null` here would make every template lookup fall
  // through to the legacy enum column.
  routineRepository.findDayTypeDefinitionBySlug.mockResolvedValue(null);
  routineRepository.findTemplateByDayTypeId.mockResolvedValue(null);
  routineRepository.findTemplateByDayType.mockResolvedValue(null);
  routineRepository.findRecentRatedLogs.mockResolvedValue([]);
  routineRepository.maxSortOrderForTemplate.mockResolvedValue(-1);
  routineRepository.findBlocksByTemplate.mockResolvedValue([]);
  // `upsertLog` returns the stored row. Defaulting it keeps assertions about the
  // *result* of `logBlockStatus` meaningful instead of `undefined`.
  routineRepository.upsertLog.mockImplementation(
    async (userId: string, blockId: string, date: string) => ({
      id: 'log-1',
      userId,
      routineBlockId: blockId,
      date,
      status: 'COMPLETED',
      note: null,
      actualStartTime: null,
      actualEndTime: null,
      durationMinutes: null,
      focusRating: null,
      productivityRating: null,
      energyLevel: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

// ============================================================================
// F3 — per-template sortOrder
// ============================================================================

describe('createBlockForDayType: sortOrder', () => {
  it('appends after the highest existing sortOrder', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.maxSortOrderForTemplate.mockResolvedValue(7);

    await new RoutineService().createBlockForDayType(USER, {
      title: 'Gym',
      startTime: '18:00',
      endTime: '19:00',
      dayTypeId: 'dt-1',
    });

    expect(routineRepository.createBlock).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 8 })
    );
  });

  it('uses max + 1, not a count, so a deleted slot cannot collide', async () => {
    // Five blocks whose sortOrders are 0,1,2,4,5 (the 3 was deleted). A count of
    // 5 would write the next block at 5 — already taken. max is 5, so the next
    // block goes to 6.
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.findBlocksByTemplate.mockResolvedValue([
      storedBlock({ id: 'b1', sortOrder: 0 }),
      storedBlock({ id: 'b2', sortOrder: 1 }),
      storedBlock({ id: 'b3', sortOrder: 2 }),
      storedBlock({ id: 'b4', sortOrder: 4 }),
      storedBlock({ id: 'b5', sortOrder: 5 }),
    ]);
    routineRepository.maxSortOrderForTemplate.mockResolvedValue(5);

    await new RoutineService().createBlockForDayType(USER, {
      title: 'New',
      startTime: '20:00',
      endTime: '21:00',
      dayTypeId: 'dt-1',
    });

    expect(routineRepository.createBlock).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 6 })
    );
  });

  it('starts at 0 for an empty template', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.maxSortOrderForTemplate.mockResolvedValue(-1);

    await new RoutineService().createBlockForDayType(USER, {
      title: 'First',
      startTime: '09:00',
      endTime: '10:00',
      dayTypeId: 'dt-1',
    });

    expect(routineRepository.createBlock).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 0 })
    );
  });

  it('lets an explicit sortOrder from the caller win', async () => {
    // Reorder and drag-to-reschedule both send an explicit position.
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.maxSortOrderForTemplate.mockResolvedValue(5);

    await new RoutineService().createBlockForDayType(USER, {
      title: 'Placed',
      startTime: '20:00',
      endTime: '21:00',
      dayTypeId: 'dt-1',
      sortOrder: 2,
    });

    expect(routineRepository.createBlock).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 2 })
    );
  });

  it('does not query max for a caller-supplied position', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());

    await new RoutineService().createBlockForDayType(USER, {
      title: 'Placed',
      startTime: '20:00',
      endTime: '21:00',
      dayTypeId: 'dt-1',
      sortOrder: 1,
    });

    expect(routineRepository.maxSortOrderForTemplate).not.toHaveBeenCalled();
  });
});

// ============================================================================
// F5 — the category is actually written
// ============================================================================

describe('createBlockForDayType: category', () => {
  it('connects the category it was given', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    categoryRepository.findById.mockResolvedValue({ id: 'cat-1', name: 'Work' });

    await new RoutineService().createBlockForDayType(USER, {
      title: 'Standup',
      startTime: '09:00',
      endTime: '09:15',
      dayTypeId: 'dt-1',
      categoryId: 'cat-1',
    });

    expect(categoryRepository.findById).toHaveBeenCalledWith('cat-1', USER);
    expect(routineRepository.createBlock).toHaveBeenCalledWith(
      expect.objectContaining({ category: { connect: { id: 'cat-1' } } })
    );
  });

  it('refuses another user’s category', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    categoryRepository.findById.mockResolvedValue(null);

    await expect(
      new RoutineService().createBlockForDayType(USER, {
        title: 'Standup',
        startTime: '09:00',
        endTime: '09:15',
        dayTypeId: 'dt-1',
        categoryId: 'cat-theirs',
      })
    ).rejects.toThrow(/Category/);

    expect(routineRepository.createBlock).not.toHaveBeenCalled();
  });

  it('leaves the category unset when none is given', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());

    await new RoutineService().createBlockForDayType(USER, {
      title: 'Standup',
      startTime: '09:00',
      endTime: '09:15',
      dayTypeId: 'dt-1',
    });

    const arg = routineRepository.createBlock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.category).toBeUndefined();
    expect(categoryRepository.findById).not.toHaveBeenCalled();
  });
});

// ============================================================================
// F15 / F29 — overlap is a warning on both create and update
// ============================================================================

describe('createBlockForDayType: overlap is a warning, never a rejection', () => {
  it('returns a warning naming the clashing block and still writes', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.findBlocksByTemplate.mockResolvedValue([
      storedBlock({ id: 'existing', title: 'Standup', startTime: '09:00', endTime: '09:30' }),
    ]);

    const result = await new RoutineService().createBlockForDayType(USER, {
      title: 'Email',
      startTime: '09:15',
      endTime: '10:00',
      dayTypeId: 'dt-1',
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'OVERLAP',
      blockId: 'existing',
      title: 'Standup',
      overlapMinutes: 15,
    });
    expect(result.warnings[0]?.message).toContain('Standup');
    expect(routineRepository.createBlock).toHaveBeenCalled();
  });

  it('reports no warning when the blocks only touch end to end', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.findBlocksByTemplate.mockResolvedValue([
      storedBlock({ id: 'existing', title: 'Standup', startTime: '09:00', endTime: '09:30' }),
    ]);

    const result = await new RoutineService().createBlockForDayType(USER, {
      title: 'Review',
      startTime: '09:30',
      endTime: '10:00',
      dayTypeId: 'dt-1',
    });

    expect(result.warnings).toEqual([]);
  });

  it('warns about a clash inside an existing overnight block', async () => {
    // The old comparison skipped any block with end <= start, so this was
    // undetectable: an evening block was saved straight through a sleep block.
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.findBlocksByTemplate.mockResolvedValue([
      storedBlock({ id: 'sleep', title: 'Sleep', startTime: '22:00', endTime: '06:00' }),
    ]);

    const result = await new RoutineService().createBlockForDayType(USER, {
      title: 'Late call',
      startTime: '23:00',
      endTime: '00:30',
      dayTypeId: 'dt-1',
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.blockId).toBe('sleep');
    expect(result.warnings[0]?.overlapMinutes).toBe(90);
  });

  it('does not warn a daytime block against a sleep block', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.findBlocksByTemplate.mockResolvedValue([
      storedBlock({ id: 'sleep', title: 'Sleep', startTime: '22:00', endTime: '06:00' }),
    ]);

    const result = await new RoutineService().createBlockForDayType(USER, {
      title: 'Deep work',
      startTime: '09:00',
      endTime: '17:00',
      dayTypeId: 'dt-1',
    });

    expect(result.warnings).toEqual([]);
  });
});

describe('updateBlockForUser: overlap is a warning, not a rejection', () => {
  beforeEach(() => {
    routineRepository.findBlockByIdForService.mockResolvedValue(
      storedBlock({ template: template() })
    );
    routineRepository.updateBlock.mockImplementation(
      async (_id: string, _userId: string, data: Record<string, unknown>) =>
        storedBlock(data as Record<string, unknown>)
    );
  });

  it('writes the block and returns a warning naming the clash', async () => {
    routineRepository.findBlocksByTemplate.mockResolvedValue([
      storedBlock({ id: 'other', title: 'Standup', startTime: '09:00', endTime: '10:00' }),
    ]);

    const result = await new RoutineService().updateBlockForUser(USER, 'blk-1', {
      title: 'Deep work',
      startTime: '09:30',
      endTime: '11:00',
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ blockId: 'other', title: 'Standup' });
    expect(routineRepository.updateBlock).toHaveBeenCalled();
  });

  it('never reports the block as conflicting with itself', async () => {
    routineRepository.findBlocksByTemplate.mockResolvedValue([
      storedBlock({ id: 'blk-1', title: 'Deep work', startTime: '09:00', endTime: '10:00' }),
      storedBlock({ id: 'other', title: 'Standup', startTime: '09:00', endTime: '10:00' }),
    ]);

    const result = await new RoutineService().updateBlockForUser(USER, 'blk-1', {
      title: 'Deep work',
      startTime: '09:15',
      endTime: '09:45',
    });

    // Only `other` clashes. The block being edited is excluded from the sibling
    // list, so moving it within its own window is silent.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.blockId).toBe('other');
  });

  it('does not check overlaps at all when the times are not in play', async () => {
    const result = await new RoutineService().updateBlockForUser(USER, 'blk-1', {
      title: 'Renamed',
    });

    expect(routineRepository.findBlocksByTemplate).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
  });

  it('derives isOvernight from the times rather than trusting the client', async () => {
    await new RoutineService().updateBlockForUser(USER, 'blk-1', {
      startTime: '22:00',
      endTime: '06:00',
      isOvernight: false,
    });

    expect(routineRepository.updateBlock).toHaveBeenCalledWith(
      'blk-1',
      USER,
      expect.objectContaining({ isOvernight: true })
    );
  });

  it('refuses a block belonging to someone else', async () => {
    routineRepository.findBlockByIdForService.mockResolvedValue(
      storedBlock({ userId: 'someone-else', template: template() })
    );

    await expect(
      new RoutineService().updateBlockForUser('someone-else-2', 'blk-1', { title: 'x' })
    ).rejects.toThrow(/Routine block/);
    expect(routineRepository.updateBlock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// F17 — energyLevel is clearable
// ============================================================================

describe('updateBlockForUser: nullable energy level', () => {
  beforeEach(() => {
    routineRepository.findBlockByIdForService.mockResolvedValue(
      storedBlock({ template: template(), energyLevel: 'HIGH' })
    );
    routineRepository.updateBlock.mockImplementation(
      async (_id: string, _userId: string, data: Record<string, unknown>) =>
        storedBlock(data as Record<string, unknown>)
    );
  });

  it('passes an explicit null straight through to the write', async () => {
    await new RoutineService().updateBlockForUser(USER, 'blk-1', { energyLevel: null });

    const data = routineRepository.updateBlock.mock.calls[0]?.[2] as Record<string, unknown>;
    // Not dropped and not coerced: the key is present with the value null, which
    // is what clears the column. `undefined` here would be stripped by Prisma
    // and leave the old level in place.
    expect('energyLevel' in data).toBe(true);
    expect(data.energyLevel).toBeNull();
  });

  it('distinguishes "clear it" from "leave it alone"', async () => {
    await new RoutineService().updateBlockForUser(USER, 'blk-1', { title: 'Renamed' });

    const data = routineRepository.updateBlock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect('energyLevel' in data).toBe(false);
  });

  it('still accepts a concrete level', async () => {
    await new RoutineService().updateBlockForUser(USER, 'blk-1', { energyLevel: 'LOW' });

    const data = routineRepository.updateBlock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(data.energyLevel).toBe('LOW');
  });
});

// ============================================================================
// F6 — one write path, and it recalculates the score
// ============================================================================

describe('logBlockStatus', () => {
  const TODAY = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    routineRepository.findBlockById.mockResolvedValue(storedBlock());
  });

  it('recalculates the daily score after a tick', async () => {
    await new RoutineService().logBlockStatus(USER, {
      blockId: 'blk-1',
      date: TODAY,
      status: 'COMPLETED',
    });

    // Routine completion feeds `DailyScore.routineCompletionRate`, so the score
    // must follow the log. This path did not recalculate at all before.
    expect(recalculateDate).toHaveBeenCalledWith(USER, TODAY);
  });

  it('recalculates after an untick too', async () => {
    await new RoutineService().logBlockStatus(USER, {
      blockId: 'blk-1',
      date: TODAY,
      clear: true,
    });

    expect(recalculateDate).toHaveBeenCalledWith(USER, TODAY);
  });

  it('recalculates through recalculateDate, not calculateDailyScore', async () => {
    // `calculateDailyScore` with no options writes `isRestDay ?? false`, so
    // using it here silently cleared the rest-day flag every time a block was
    // ticked. `recalculateDate` reads the existing flags and passes them back.
    await new RoutineService().logBlockStatus(USER, {
      blockId: 'blk-1',
      date: TODAY,
      status: 'COMPLETED',
    });

    expect(recalculateDate).toHaveBeenCalled();
  });

  it('still writes the log when the recalculation throws', async () => {
    recalculateDate.mockRejectedValueOnce(new Error('score service down'));

    const log = await new RoutineService().logBlockStatus(USER, {
      blockId: 'blk-1',
      date: TODAY,
      status: 'COMPLETED',
    });

    // The user's action succeeded; failing the whole request because a derived
    // recompute threw would show an error for something that was saved.
    expect(log).toBeTruthy();
    expect(routineRepository.upsertLog).toHaveBeenCalled();
  });

  it('accepts every RoutineLogStatus', async () => {
    for (const status of ['COMPLETED', 'PARTIAL', 'MISSED', 'IN_PROGRESS'] as const) {
      await new RoutineService().logBlockStatus(USER, { blockId: 'blk-1', date: TODAY, status });
    }
    expect(routineRepository.upsertLog).toHaveBeenCalledTimes(4);
  });

  it('stores the optional columns the endpoint now accepts', async () => {
    await new RoutineService().logBlockStatus(USER, {
      blockId: 'blk-1',
      date: TODAY,
      status: 'PARTIAL',
      note: 'ran long',
      actualStartTime: '09:05',
      actualEndTime: '10:10',
      focusRating: 4,
      productivityRating: 3,
      energyLevel: 2,
    });

    const data = routineRepository.upsertLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(data).toMatchObject({
      status: 'PARTIAL',
      note: 'ran long',
      actualStartTime: '09:05',
      actualEndTime: '10:10',
      focusRating: 4,
      productivityRating: 3,
      energyLevel: 2,
      durationMinutes: 65,
    });
  });

  it('measures a completion that runs past midnight as a positive duration', async () => {
    await new RoutineService().logBlockStatus(USER, {
      blockId: 'blk-1',
      date: TODAY,
      status: 'COMPLETED',
      actualStartTime: '23:30',
      actualEndTime: '00:30',
    });

    const data = routineRepository.upsertLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(data.durationMinutes).toBe(60);
  });

  it('leaves durationMinutes null when no actual times were given', async () => {
    await new RoutineService().logBlockStatus(USER, {
      blockId: 'blk-1',
      date: TODAY,
      status: 'COMPLETED',
    });

    const data = routineRepository.upsertLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(data.durationMinutes).toBeNull();
  });

  it('deletes the row on an untick rather than writing a MISSED', async () => {
    const result = await new RoutineService().logBlockStatus(USER, {
      blockId: 'blk-1',
      date: TODAY,
      clear: true,
    });

    expect(routineRepository.deleteLog).toHaveBeenCalledWith(USER, 'blk-1', TODAY);
    expect(routineRepository.upsertLog).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('refuses a block the caller does not own', async () => {
    routineRepository.findBlockById.mockResolvedValue(null);

    await expect(
      new RoutineService().logBlockStatus('someone-else', {
        blockId: 'blk-1',
        date: TODAY,
        status: 'COMPLETED',
      })
    ).rejects.toThrow(/not found/i);

    expect(routineRepository.upsertLog).not.toHaveBeenCalled();
    expect(recalculateDate).not.toHaveBeenCalled();
  });

  it('requires a status unless the log is being cleared', async () => {
    await expect(
      new RoutineService().logBlockStatus(USER, { blockId: 'blk-1', date: TODAY })
    ).rejects.toThrow(/status is required/i);
  });
});

describe('block writes: the retroactive edit window (F6 parity)', () => {
  const today = new Date().toISOString().slice(0, 10);

  function daysAgo(days: number): string {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  beforeEach(() => {
    // Window fully closed, so anything in the past is refused and today is not.
    userRepository.getSettings.mockResolvedValue({ timezone: 'UTC', retroactiveEditDays: 0 });
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.maxSortOrderForTemplate.mockResolvedValue(0);
    routineRepository.findBlockByIdForService.mockResolvedValue(
      storedBlock({ userId: USER })
    );
  });

  it('refuses to create a block against a locked date, and writes nothing', async () => {
    await expect(
      new RoutineService().createBlockForDayType(USER, {
        title: 'Gym',
        startTime: '18:00',
        endTime: '19:00',
        dayTypeId: 'dt-1',
        date: daysAgo(5),
      })
    ).rejects.toBeInstanceOf(EditWindowError);

    expect(routineRepository.createBlock).not.toHaveBeenCalled();
  });

  it('refuses to update a block against a locked date, and writes nothing', async () => {
    await expect(
      new RoutineService().updateBlockForUser(USER, 'blk-1', {
        title: 'Renamed',
        date: daysAgo(5),
      })
    ).rejects.toBeInstanceOf(EditWindowError);

    expect(routineRepository.updateBlock).not.toHaveBeenCalled();
  });

  it('refuses to delete a block against a locked date, and deletes nothing', async () => {
    await expect(
      new RoutineService().deleteById(USER, 'blk-1', daysAgo(5))
    ).rejects.toBeInstanceOf(EditWindowError);

    expect(routineRepository.deleteBlock).not.toHaveBeenCalled();
  });

  it('allows all three against today', async () => {
    await expect(
      new RoutineService().createBlockForDayType(USER, {
        title: 'Gym',
        startTime: '18:00',
        endTime: '19:00',
        dayTypeId: 'dt-1',
        date: today,
      })
    ).resolves.toBeDefined();

    await expect(
      new RoutineService().updateBlockForUser(USER, 'blk-1', { title: 'Renamed', date: today })
    ).resolves.toBeDefined();

    await expect(new RoutineService().deleteById(USER, 'blk-1', today)).resolves.toBe('block');
  });

  /*
   * The escape hatch, and the reason it is not a hole: `/settings/routine` edits
   * templates with no date in play. Omitting `date` asserts nothing, so template
   * management keeps working regardless of the window.
   */
  it('asserts nothing when no date is supplied, so template management is unaffected', async () => {
    await expect(
      new RoutineService().createBlockForDayType(USER, {
        title: 'Gym',
        startTime: '18:00',
        endTime: '19:00',
        dayTypeId: 'dt-1',
      })
    ).resolves.toBeDefined();

    await expect(
      new RoutineService().updateBlockForUser(USER, 'blk-1', { title: 'Renamed' })
    ).resolves.toBeDefined();

    await expect(new RoutineService().deleteById(USER, 'blk-1')).resolves.toBe('block');
  });

  it('never forwards the context date to the repository as a column', async () => {
    // `RoutineBlock` has no `date` column. If this ever leaks through, Prisma
    // throws at runtime and the write fails for a reason nobody can explain.
    await new RoutineService().updateBlockForUser(USER, 'blk-1', {
      title: 'Renamed',
      date: today,
    });

    expect(routineRepository.updateBlock).toHaveBeenCalledWith(
      'blk-1',
      USER,
      expect.not.objectContaining({ date: expect.anything() })
    );
  });
});

describe('applyTemplateToRange', () => {
  const today = new Date().toISOString().slice(0, 10);

  function daysAgo(days: number): string {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  beforeEach(() => {
    // A generous window so the edit window is not what is under test here; the
    // skip-reason assertions below use a closed window explicitly.
    userRepository.getSettings.mockResolvedValue({ timezone: 'UTC', retroactiveEditDays: 30 });
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(template());
    routineRepository.findDayTypeDefinitionById.mockResolvedValue({ id: 'dt-1' });
    routineRepository.listExceptions.mockResolvedValue([]);
  });

  it('writes one exception per date in the range', async () => {
    const result = await new RoutineService().applyTemplateToRange(USER, {
      startDate: today,
      endDate: daysAgo(-6),
      dayTypeId: 'dt-1',
    });

    expect(result.applied).toHaveLength(7);
    expect(result.skipped).toEqual([]);
    expect(routineRepository.upsertExceptions).toHaveBeenCalledWith(
      USER,
      expect.arrayContaining([
        expect.objectContaining({ date: today, dayTypeId: 'dt-1' }),
        expect.objectContaining({ date: daysAgo(-6) }),
      ])
    );
  });

  it('rejects a reversed range before writing anything', async () => {
    // `daysAgo(n)` is today - n, so this is the 2nd-before through the 8th-before:
    // a start that sits after its end.
    await expect(
      new RoutineService().applyTemplateToRange(USER, {
        startDate: daysAgo(2),
        endDate: daysAgo(8),
        dayTypeId: 'dt-1',
      })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(routineRepository.upsertExceptions).not.toHaveBeenCalled();
  });

  it('refuses a range longer than a year', async () => {
    await expect(
      new RoutineService().applyTemplateToRange(USER, {
        startDate: today,
        endDate: daysAgo(-400),
        dayTypeId: 'dt-1',
      })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(routineRepository.upsertExceptions).not.toHaveBeenCalled();
  });

  it('refuses when the day type has no schedule to apply', async () => {
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(null);

    await expect(
      new RoutineService().applyTemplateToRange(USER, {
        startDate: today,
        endDate: daysAgo(-2),
        dayTypeId: 'dt-1',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses when the day type definition is not the user\'s', async () => {
    routineRepository.findDayTypeDefinitionById.mockResolvedValue(null);

    await expect(
      new RoutineService().applyTemplateToRange(USER, {
        startDate: today,
        endDate: daysAgo(-2),
        dayTypeId: 'dt-1',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /*
   * The F2 lesson applied to a write: a partial result must say which part.
   */
  it('skips dates that already have an override, and reports each one', async () => {
    routineRepository.listExceptions.mockResolvedValue([
      { date: daysAgo(-2) },
      { date: daysAgo(-4) },
    ]);

    const result = await new RoutineService().applyTemplateToRange(USER, {
      startDate: today,
      endDate: daysAgo(-4),
      dayTypeId: 'dt-1',
    });

    expect(result.applied).toHaveLength(3);
    expect(result.skipped.map((row) => row.date)).toEqual([daysAgo(-2), daysAgo(-4)]);
    expect(result.skipped[0]?.reason).toMatch(/already/i);
  });

  it('overwrites existing overrides only when asked', async () => {
    routineRepository.listExceptions.mockResolvedValue([{ date: daysAgo(-1) }]);

    const result = await new RoutineService().applyTemplateToRange(USER, {
      startDate: today,
      endDate: daysAgo(-1),
      dayTypeId: 'dt-1',
      overwrite: true,
    });

    expect(result.applied).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  it('skips dates outside the retroactive edit window, and reports them', async () => {
    userRepository.getSettings.mockResolvedValue({ timezone: 'UTC', retroactiveEditDays: 2 });

    // Nine days ago through today: ten dates.
    const result = await new RoutineService().applyTemplateToRange(USER, {
      startDate: daysAgo(9),
      endDate: today,
      dayTypeId: 'dt-1',
    });

    // A window of 2 admits today and the two days before it.
    expect(result.applied).toHaveLength(3);
    expect(result.skipped).toHaveLength(7);
    // Oldest first, and each carries a reason the UI can show.
    expect(result.skipped[0]?.date).toBe(daysAgo(9));
    expect(result.skipped[0]?.reason).toBeTruthy();
  });
});

describe('logBlockStatus: the retroactive edit window', () => {
  const today = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    routineRepository.findBlockById.mockResolvedValue(storedBlock());
  });

  function daysAgo(days: number): string {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  it('allows today with the window closed', async () => {
    userRepository.getSettings.mockResolvedValue({ timezone: 'UTC', retroactiveEditDays: 0 });

    await expect(
      new RoutineService().logBlockStatus(USER, {
        blockId: 'blk-1',
        date: today,
        status: 'COMPLETED',
      })
    ).resolves.not.toThrow();
  });

  it('allows a future date with the window closed', async () => {
    userRepository.getSettings.mockResolvedValue({ timezone: 'UTC', retroactiveEditDays: 0 });

    const future = daysAgo(-3);
    await expect(
      new RoutineService().logBlockStatus(USER, {
        blockId: 'blk-1',
        date: future,
        status: 'COMPLETED',
      })
    ).resolves.not.toThrow();
  });

  it('refuses a past date beyond the window, and writes nothing', async () => {
    userRepository.getSettings.mockResolvedValue({ timezone: 'UTC', retroactiveEditDays: 2 });

    await expect(
      new RoutineService().logBlockStatus(USER, {
        blockId: 'blk-1',
        date: daysAgo(10),
        status: 'COMPLETED',
      })
    ).rejects.toBeInstanceOf(EditWindowError);

    expect(routineRepository.upsertLog).not.toHaveBeenCalled();
    expect(recalculateDate).not.toHaveBeenCalled();
  });

  it('allows the boundary day inside the window', async () => {
    userRepository.getSettings.mockResolvedValue({ timezone: 'UTC', retroactiveEditDays: 2 });

    await expect(
      new RoutineService().logBlockStatus(USER, {
        blockId: 'blk-1',
        date: daysAgo(2),
        status: 'COMPLETED',
      })
    ).resolves.not.toThrow();
  });

  it('falls back to the default window when settings cannot be read', async () => {
    userRepository.getSettings.mockResolvedValue(null);

    await expect(
      new RoutineService().logBlockStatus(USER, {
        blockId: 'blk-1',
        date: daysAgo(3),
        status: 'COMPLETED',
      })
    ).resolves.not.toThrow();

    await expect(
      new RoutineService().logBlockStatus(USER, {
        blockId: 'blk-1',
        date: daysAgo(4),
        status: 'COMPLETED',
      })
    ).rejects.toBeInstanceOf(EditWindowError);
  });

  it('survives a settings read that rejects', async () => {
    userRepository.getSettings.mockRejectedValue(new Error('db down'));

    await expect(
      new RoutineService().logBlockStatus(USER, {
        blockId: 'blk-1',
        date: today,
        status: 'COMPLETED',
      })
    ).resolves.not.toThrow();
  });
});

describe('logBlockCompletion delegates to the one write path', () => {
  const today = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    routineRepository.findBlockById.mockResolvedValue(storedBlock());
  });

  it('reaches the same log write and the same recalculation', async () => {
    await new RoutineService().logBlockCompletion(USER, 'blk-1', today, 'COMPLETED', {
      note: 'via notification',
    });

    expect(routineRepository.upsertLog).toHaveBeenCalledWith(
      USER,
      'blk-1',
      today,
      expect.objectContaining({ status: 'COMPLETED', note: 'via notification' })
    );
    expect(recalculateDate).toHaveBeenCalledWith(USER, today);
  });
});

// ============================================================================
// Deleting the last block must not delete the template
// ============================================================================

describe('deleteById', () => {
  it('deletes the block and leaves the template when it was the last one', async () => {
    // The audit assumed this was dangerous. It is not, and the reason is the
    // ordering: a block is resolved first, and the template branch is only
    // reached when no owned *block* matches. Pinned so the ordering is not
    // "tidied up" into a regression.
    routineRepository.findBlockByIdForService.mockResolvedValue(storedBlock());

    const result = await new RoutineService().deleteById(USER, 'blk-1');

    expect(result).toBe('block');
    expect(routineRepository.deleteBlock).toHaveBeenCalledWith('blk-1', USER);
    expect(routineRepository.deleteTemplate).not.toHaveBeenCalled();
    expect(routineRepository.findTemplateById).not.toHaveBeenCalled();
  });

  it('deletes a template only when the id is not a block of the user', async () => {
    routineRepository.findBlockByIdForService.mockResolvedValue(null);
    routineRepository.findTemplateById.mockResolvedValue(template());

    const result = await new RoutineService().deleteById(USER, TEMPLATE_ID);

    expect(result).toBe('template');
    expect(routineRepository.deleteTemplate).toHaveBeenCalledWith(TEMPLATE_ID, USER);
  });

  it('never deletes a block belonging to another user', async () => {
    routineRepository.findBlockByIdForService.mockResolvedValue(
      storedBlock({ userId: 'someone-else' })
    );
    routineRepository.findTemplateById.mockResolvedValue(null);

    await expect(new RoutineService().deleteById(USER, 'blk-1')).rejects.toThrow(/Routine/);
    expect(routineRepository.deleteBlock).not.toHaveBeenCalled();
    expect(routineRepository.deleteTemplate).not.toHaveBeenCalled();
  });

  it('404s when the id is neither', async () => {
    routineRepository.findBlockByIdForService.mockResolvedValue(null);
    routineRepository.findTemplateById.mockResolvedValue(null);

    await expect(new RoutineService().deleteById(USER, 'nope')).rejects.toThrow(/Routine/);
  });
});
/* ============================================================================
 * getRoutineForDate: day type -> definition -> template
 *
 * The bug this pins: the natural resolver returns the DayType ENUM and
 * `dayTypeId: null`, so the template lookup fell through to the legacy
 * `RoutineTemplate.dayType` column, which is `@default(CUSTOM)` for every
 * definition-linked template. Two symptoms, both user-reported:
 *
 *   - a date reached by navigation rendered "no blocks" at all, while the SAME
 *     day reached by changing the day type on /today rendered fine (that path
 *     carries an explicit `templateId` and never consults the day type);
 *   - and it sometimes showed the WRONG blocks, because the fallback is a
 *     `findFirst` over `dayType: 'CUSTOM'` and returned whichever custom
 *     template came first.
 * ========================================================================== */
describe('getRoutineForDate: resolving the template through the day type', () => {
  const day = '2026-10-03'; // a Saturday

  it('matches a NATURAL day type by its definition id, not the legacy enum column', async () => {
    routineRepository.findDayTypeDefinitionBySlug.mockResolvedValue({
      id: 'dt-weekend',
      name: 'Weekend',
      slug: 'weekend',
    });
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(
      template({ id: 'tpl-weekend', dayTypeId: 'dt-weekend' })
    );

    const result = await new RoutineService().getRoutineForDate(USER, day);

    expect(routineRepository.findTemplateByDayTypeId).toHaveBeenCalledWith(
      USER,
      'dt-weekend'
    );
    // The legacy enum column must NOT be consulted: it can return a wrong
    // template, which is the second symptom.
    expect(routineRepository.findTemplateByDayType).not.toHaveBeenCalled();
    expect(result.dayTypeId).toBe('dt-weekend');
    expect(result.dayTypeName).toBe('Weekend');
  });

  it('reports the resolved dayTypeId so the page can match its tab strip', async () => {
    routineRepository.findDayTypeDefinitionBySlug.mockResolvedValue({
      id: 'dt-weekend',
      name: 'Weekend',
      slug: 'weekend',
    });
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(
      template({ dayTypeId: 'dt-weekend' })
    );

    const result = await new RoutineService().getRoutineForDate(USER, day);

    /*
     * `dayTypeId: null` here is what made `/routine` treat EVERY date as "viewing
     * another day type" and render the empty state, because the strip had nothing
     * to match the selected tab against.
     */
    expect(result.dayTypeId).not.toBeNull();
  });

  it('prefers an exception`s explicit dayTypeId over the natural slug', async () => {
    routineRepository.findException.mockResolvedValue({
      date: day,
      dayType: 'CUSTOM',
      dayTypeId: 'dt-college',
      templateId: null,
    });
    routineRepository.findTemplateByDayTypeId.mockResolvedValue(
      template({ dayTypeId: 'dt-college' })
    );

    const result = await new RoutineService().getRoutineForDate(USER, day);

    // A custom type like "College" is only reachable this way - the enum has no
    // COLLEGE member, so the natural path could never find it.
    expect(routineRepository.findDayTypeDefinitionBySlug).not.toHaveBeenCalled();
    expect(routineRepository.findTemplateByDayTypeId).toHaveBeenCalledWith(
      USER,
      'dt-college'
    );
    expect(result.dayTypeId).toBe('dt-college');
  });

  it('still honours an exception`s explicit templateId', async () => {
    routineRepository.findException.mockResolvedValue({
      date: day,
      dayType: 'CUSTOM',
      dayTypeId: 'dt-college',
      templateId: 'tpl-explicit',
    });
    routineRepository.findTemplateWithBlocks.mockResolvedValue(
      template({ id: 'tpl-explicit', dayTypeId: 'dt-college' })
    );

    const result = await new RoutineService().getRoutineForDate(USER, day);

    expect(routineRepository.findTemplateWithBlocks).toHaveBeenCalledWith(
      'tpl-explicit',
      USER
    );
    expect(result.dayTypeId).toBe('dt-college');
  });

  it('falls back to the enum column ONLY when no definition matches', async () => {
    routineRepository.findDayTypeDefinitionBySlug.mockResolvedValue(null);
    routineRepository.findTemplateByDayType.mockResolvedValue(
      template({ dayTypeId: null, dayType: 'WORKDAY' })
    );

    await new RoutineService().getRoutineForDate(USER, day);

    expect(routineRepository.findTemplateByDayType).toHaveBeenCalledWith(USER, 'WEEKEND');
  });
});
