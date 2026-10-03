import { HabitService } from '@/server/services/habit.service';
import { GoalService } from '@/server/services/goal.service';
import { TaskService } from '@/server/services/task.service';
import type { UserId } from '@/types/ids';

/**
 * Bulk Service
 *
 * Orchestrates bulk operations across entity types.
 *
 * `/api/bulk/archive` previously reached into `GoalRepository` directly to
 * express "archiving a goal means cancelling it", while delegating habits and
 * tasks to their services. That knowledge now lives in each service, and this
 * service owns the per-item loop and the partial-success reporting.
 */

export type BulkEntity = 'habit' | 'goal' | 'task';

export interface BulkResult {
  id: string;
  success: boolean;
  error?: string;
}

export class BulkService {
  private habitService: HabitService;
  private goalService: GoalService;
  private taskService: TaskService;

  constructor() {
    this.habitService = new HabitService();
    this.goalService = new GoalService();
    this.taskService = new TaskService();
  }

  /**
   * Archive a batch of entities of one type.
   *
   * Each item is attempted independently: one failure does not abort the batch,
   * and every outcome is reported.
   */
  async archive(userId: UserId, type: BulkEntity, ids: string[]): Promise<BulkResult[]> {
    const results: BulkResult[] = [];

    for (const id of ids) {
      try {
        if (type === 'habit') {
          await this.habitService.archiveHabit(userId, id);
        } else if (type === 'goal') {
          await this.goalService.archiveGoal(userId, id);
        } else {
          await this.taskService.archiveTask(userId, id);
        }
        results.push({ id, success: true });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Archive failed',
        });
      }
    }

    return results;
  }

  /**
   * Delete a batch of entities of one type.
   */
  async remove(userId: UserId, type: BulkEntity, ids: string[]): Promise<BulkResult[]> {
    const results: BulkResult[] = [];

    for (const id of ids) {
      try {
        if (type === 'habit') {
          await this.habitService.deleteHabit(userId, id);
        } else if (type === 'goal') {
          await this.goalService.deleteGoal(userId, id);
        } else {
          await this.taskService.deleteTask(userId, id);
        }
        results.push({ id, success: true });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Delete failed',
        });
      }
    }

    return results;
  }
}

export const bulkService = new BulkService();
