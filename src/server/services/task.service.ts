import type { Task, TaskPriority } from '@prisma/client';
import { TaskRepository } from '@/server/repositories/task.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { ProjectRepository } from '@/server/repositories/project.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import {
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
} from '@/schemas/task.schema';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskQueryParams,
} from '@/schemas/task.schema';

/**
 * Task Service
 * Business logic for task management
 */

export class TaskService {
  private taskRepository: TaskRepository;
  private goalRepository: GoalRepository;
  private projectRepository: ProjectRepository;
  private auditRepository: AuditRepository;

  constructor() {
    this.taskRepository = new TaskRepository();
    this.goalRepository = new GoalRepository();
    this.projectRepository = new ProjectRepository();
    this.auditRepository = new AuditRepository();
  }

  /**
   * Create a task, validating referenced entities first
   */
  async createTask(userId: string, input: CreateTaskInput) {
    const parsed = createTaskSchema.parse(input);

    if (parsed.goalId) {
      const goal = await this.goalRepository.findById(parsed.goalId, userId);
      if (!goal) {
        throw new Error('Goal not found');
      }
    }

    if (parsed.projectId) {
      const project = await this.projectRepository.findById(userId, parsed.projectId);
      if (!project) {
        throw new Error('Project not found');
      }
    }

    if (parsed.parentTaskId) {
      const parent = await this.taskRepository.findById(userId, parsed.parentTaskId);
      if (!parent) {
        throw new Error('Parent task not found');
      }
    }

    if (parsed.dependsOnIds?.length) {
      for (const depId of parsed.dependsOnIds) {
        const dep = await this.taskRepository.findById(userId, depId);
        if (!dep) {
          throw new Error(`Dependency task not found: ${depId}`);
        }
      }
    }

    const task = await this.taskRepository.create(userId, {
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      priority: parsed.priority,
      projectId: parsed.projectId,
      goalId: parsed.goalId,
      parentTaskId: parsed.parentTaskId,
      dueDate: parsed.dueDate,
      scheduledFor: parsed.scheduledFor,
      estimatedMinutes: parsed.estimatedMinutes,
      isUrgent: parsed.isUrgent,
      isImportant: parsed.isImportant,
      tagIds: parsed.tagIds,
      dependsOnIds: parsed.dependsOnIds,
    });

    await this.auditRepository.create({
      userId,
      action: 'GOAL_CREATED',
      entityType: 'TASK',
      entityId: task.id,
      metadata: { title: task.title },
    });

    return task;
  }

  /**
   * List tasks for a user with optional filters
   */
  async getTasks(userId: string, query: TaskQueryParams = {}) {
    const parsed = taskQuerySchema.parse(query);

    let tasks = await this.taskRepository.findAll(userId, {
      status: parsed.status,
      priority: parsed.priority,
      projectId: parsed.projectId,
      goalId: parsed.goalId,
      search: parsed.search,
    });

    tasks = this.filterTasks(tasks, parsed);
    tasks = this.sortTasks(tasks, parsed.sortBy, parsed.sortOrder);

    if (parsed.offset !== undefined) {
      tasks = tasks.slice(parsed.offset);
    }
    if (parsed.limit !== undefined) {
      tasks = tasks.slice(0, parsed.limit);
    }

    return tasks;
  }

  /**
   * Get a single task with full relations
   */
  async getTask(userId: string, taskId: string) {
    const task = await this.taskRepository.findById(userId, taskId);
    if (!task) {
      throw new Error('Task not found');
    }
    return task;
  }

  /**
   * Update a task owned by the user
   */
  async updateTask(userId: string, taskId: string, input: UpdateTaskInput) {
    await this.getTask(userId, taskId);

    const parsed = updateTaskSchema.parse(input);

    const task = await this.taskRepository.update(userId, taskId, {
      ...(parsed.title && { title: parsed.title }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.status && { status: parsed.status }),
      ...(parsed.priority && { priority: parsed.priority }),
      ...(parsed.projectId !== undefined && {
        project: parsed.projectId
          ? { connect: { id: parsed.projectId } }
          : { disconnect: true },
      }),
      ...(parsed.goalId !== undefined && {
        goal: parsed.goalId
          ? { connect: { id: parsed.goalId } }
          : { disconnect: true },
      }),
      ...(parsed.parentTaskId !== undefined && {
        parentTask: parsed.parentTaskId
          ? { connect: { id: parsed.parentTaskId } }
          : { disconnect: true },
      }),
      ...(parsed.dueDate !== undefined && { dueDate: parsed.dueDate ?? null }),
      ...(parsed.scheduledFor !== undefined && {
        scheduledFor: parsed.scheduledFor ?? null,
      }),
      ...(parsed.estimatedMinutes !== undefined && {
        estimatedMinutes: parsed.estimatedMinutes,
      }),
      ...(parsed.actualMinutes !== undefined && {
        actualMinutes: parsed.actualMinutes,
      }),
      ...(parsed.isUrgent !== undefined && { isUrgent: parsed.isUrgent }),
      ...(parsed.isImportant !== undefined && { isImportant: parsed.isImportant }),
    });

    await this.auditRepository.create({
      userId,
      action: 'GOAL_UPDATED',
      entityType: 'TASK',
      entityId: taskId,
    });

    return this.getTask(userId, taskId);
  }

  /**
   * Complete a task, optionally progressing its linked goal
   */
  async completeTask(userId: string, taskId: string) {
    const task = await this.getTask(userId, taskId);

    if (task.status === 'COMPLETED') {
      return task;
    }

    await this.taskRepository.complete(userId, taskId);

    if (task.goalId) {
      const goal = await this.goalRepository.findById(task.goalId, userId);
      if (goal) {
        await this.goalRepository.updateProgress(
          task.goalId,
          userId,
          (goal.currentValue ?? 0) + 1
        );
      }
    }

    return this.getTask(userId, taskId);
  }

  /**
   * Archive a task (marks it as cancelled)
   */
  async archiveTask(userId: string, taskId: string) {
    await this.getTask(userId, taskId);

    return this.taskRepository.archive(userId, taskId);
  }

  /**
   * Delete a task (permanently removes it)
   */
  async deleteTask(userId: string, taskId: string): Promise<void> {
    await this.getTask(userId, taskId);

    await this.taskRepository.delete(userId, taskId);

    await this.auditRepository.create({
      userId,
      action: 'GOAL_DELETED',
      entityType: 'TASK',
      entityId: taskId,
    });
  }

  /**
   * Bulk create tasks for a user
   */
  async bulkCreate(userId: string, tasks: CreateTaskInput[]): Promise<number> {
    const parsed = tasks.map((task) => createTaskSchema.parse(task));

    return this.taskRepository.bulkCreate(
      userId,
      parsed.map((task) => ({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        goalId: task.goalId,
        parentTaskId: task.parentTaskId,
        dueDate: task.dueDate,
        scheduledFor: task.scheduledFor,
        estimatedMinutes: task.estimatedMinutes,
        isUrgent: task.isUrgent ?? false,
        isImportant: task.isImportant ?? false,
      }))
    );
  }

  /**
   * Replace the dependencies of a task, preventing circular dependencies
   */
  async setDependencies(
    userId: string,
    taskId: string,
    dependsOnIds: string[]
  ): Promise<{ taskId: string; dependencyCount: number }> {
    await this.getTask(userId, taskId);

    for (const depId of dependsOnIds) {
      const dep = await this.taskRepository.findById(userId, depId);
      if (!dep) {
        throw new Error(`Dependency task not found: ${depId}`);
      }
    }

    const cycle = await this.wouldCreateCycle(userId, taskId, dependsOnIds);
    if (cycle) {
      throw new Error('Circular dependency detected');
    }

    const dependencyCount = await this.taskRepository.setDependencies(
      userId,
      taskId,
      dependsOnIds
    );

    return { taskId, dependencyCount };
  }

  /**
   * Get the dependencies of a task
   */
  async getDependencies(userId: string, taskId: string) {
    await this.getTask(userId, taskId);

    return this.taskRepository.getDependencies(userId, taskId);
  }

  /**
   * Get aggregated stats for a user's tasks
   */
  async getTaskStats(userId: string, query: TaskQueryParams = {}) {
    const parsed = taskQuerySchema.parse(query);

    const allTasks = await this.getAllTasks(userId);
    const tasks = this.filterTasks(allTasks, parsed);

    const now = new Date();
    const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
    const pendingCount = tasks.length - completedCount;
    const overdueCount = tasks.filter(
      (t) =>
        t.dueDate &&
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED' &&
        new Date(t.dueDate) < now
    ).length;

    const byPriority: Record<string, number> = {};
    for (const priority of Object.values(TaskPriority)) {
      byPriority[priority] = tasks.filter((t) => t.priority === priority).length;
    }

    const byStatus: Record<string, number> = {};
    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    }

    return {
      total: tasks.length,
      completed: completedCount,
      pending: pendingCount,
      inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      waiting: tasks.filter((t) => t.status === 'WAITING').length,
      overdue: overdueCount,
      completionRate:
        tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0,
      averageEstimatedMinutes:
        tasks.length > 0
          ? Math.round(
              tasks.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0) /
                tasks.length
            )
          : 0,
      byPriority,
      byStatus,
    };
  }

  /**
   * Apply client-side filters that the repository does not support
   */
  private filterTasks(tasks: Task[], parsed: TaskQueryParams): Task[] {
    const today = new Date();

    return tasks.filter((task) => {
      if (parsed.status?.length && !parsed.status.includes(task.status)) {
        return false;
      }
      if (parsed.priority?.length && !parsed.priority.includes(task.priority)) {
        return false;
      }
      if (parsed.search) {
        const q = parsed.search.toLowerCase();
        const matches =
          task.title.toLowerCase().includes(q) ||
          (task.description?.toLowerCase().includes(q) ?? false);
        if (!matches) return false;
      }
      if (parsed.parentTaskId !== undefined && task.parentTaskId !== parsed.parentTaskId) {
        return false;
      }
      if (parsed.isUrgent !== undefined && task.isUrgent !== parsed.isUrgent) {
        return false;
      }
      if (parsed.isImportant !== undefined && task.isImportant !== parsed.isImportant) {
        return false;
      }
      if (parsed.includeCompleted === false && task.status === 'COMPLETED') {
        return false;
      }
      if (parsed.dueBefore) {
        if (!task.dueDate) return false;
        const dueDateStr = new Date(task.dueDate).toISOString().split('T')[0];
        if (dueDateStr > parsed.dueBefore) return false;
      }
      if (parsed.dueAfter) {
        if (!task.dueDate) return false;
        const dueDateStr = new Date(task.dueDate).toISOString().split('T')[0];
        if (dueDateStr < parsed.dueAfter) return false;
      }
      if (parsed.overdue !== undefined) {
        const isOverdue =
          !!task.dueDate &&
          task.status !== 'COMPLETED' &&
          task.status !== 'CANCELLED' &&
          new Date(task.dueDate) < today;
        if (isOverdue !== parsed.overdue) return false;
      }
      return true;
    });
  }

  /**
   * Apply client-side sorting to task results
   */
  private sortTasks(
    tasks: Task[],
    sortBy: TaskQueryParams['sortBy'],
    sortOrder: TaskQueryParams['sortOrder']
  ): Task[] {
    if (!sortBy) {
      return tasks;
    }

    const dir = sortOrder === 'asc' ? 1 : -1;
    const sorted = [...tasks];

    sorted.sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title) * dir;
      }
      if (sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1 * dir;
        if (!b.dueDate) return -1 * dir;
        return (a.dueDate.getTime() - b.dueDate.getTime()) * dir;
      }
      if (sortBy === 'scheduledFor') {
        if (!a.scheduledFor && !b.scheduledFor) return 0;
        if (!a.scheduledFor) return 1 * dir;
        if (!b.scheduledFor) return -1 * dir;
        return (a.scheduledFor.getTime() - b.scheduledFor.getTime()) * dir;
      }
      if (sortBy === 'priority') {
        return a.priority.localeCompare(b.priority) * dir;
      }
      if (sortBy === 'status') {
        return a.status.localeCompare(b.status) * dir;
      }
      if (sortBy === 'createdAt') {
        return (a.createdAt.getTime() - b.createdAt.getTime()) * dir;
      }
      return 0;
    });

    return sorted;
  }

  /**
   * Fetch all of a user's tasks in pages
   */
  private async getAllTasks(userId: string): Promise<Task[]> {
    const tasks: Task[] = [];
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const page = await this.taskRepository.findAll(userId, {
        limit: pageSize,
        offset,
      });
      tasks.push(...page);
      if (page.length < pageSize) {
        break;
      }
      offset += pageSize;
    }

    return tasks;
  }

  /**
   * Detect whether adding `dependsOnIds` to `taskId` would create a cycle
   */
  private async wouldCreateCycle(
    userId: string,
    taskId: string,
    dependsOnIds: string[]
  ): Promise<boolean> {
    for (const depId of dependsOnIds) {
      if (depId === taskId) {
        return true;
      }

      const stack: string[] = [depId];
      const visited = new Set<string>();

      while (stack.length > 0) {
        const current = stack.pop() as string;
        if (current === taskId) {
          return true;
        }
        if (visited.has(current)) {
          continue;
        }
        visited.add(current);

        const deps = await this.taskRepository.getDependencies(userId, current);
        for (const dep of deps) {
          stack.push(dep.dependsOnId);
        }
      }
    }

    return false;
  }
}