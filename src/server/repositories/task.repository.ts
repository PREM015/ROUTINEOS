import type { Task, TaskDependency, Prisma, TaskPriority } from '@prisma/client';
import { TaskStatus } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Task Repository
 * Database operations for Task and TaskDependency models
 */

interface CreateTaskData {
  title: string;
  description?: string;
  projectId?: string | null;
  goalId?: string | null;
  parentTaskId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  scheduledFor?: Date | null;
  estimatedMinutes?: number;
  isUrgent?: boolean;
  isImportant?: boolean;
  tagIds?: string[];
  dependsOnIds?: string[];
}

interface TaskQueryParams {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  projectId?: string;
  goalId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class TaskRepository extends BaseRepository {
  /**
   * Create a task with optional tags and dependencies
   */
  async create(userId: string, data: CreateTaskData): Promise<Task> {
    try {
      const tagIds = data.tagIds ?? [];
      const dependsOnIds = data.dependsOnIds ?? [];

      return await this.prisma.task.create({
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          dueDate: data.dueDate,
          scheduledFor: data.scheduledFor,
          estimatedMinutes: data.estimatedMinutes,
          isUrgent: data.isUrgent,
          isImportant: data.isImportant,
          project: data.projectId
            ? { connect: { id: data.projectId } }
            : undefined,
          goal: data.goalId ? { connect: { id: data.goalId } } : undefined,
          parentTask: data.parentTaskId
            ? { connect: { id: data.parentTaskId } }
            : undefined,
          tags:
            tagIds.length > 0
              ? { createMany: { data: tagIds.map((tagId) => ({ tagId })) } }
              : undefined,
          dependsOn:
            dependsOnIds.length > 0
              ? {
                  create: dependsOnIds.map((dependsOnId) => ({
                    dependsOn: { connect: { id: dependsOnId } },
                  })),
                }
              : undefined,
          user: { connect: { id: userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find all tasks for a user with optional filters
   */
  async findAll(userId: string, query: TaskQueryParams = {}) {
    try {
      const where: Prisma.TaskWhereInput = { userId };

      if (query.status) {
        where.status = Array.isArray(query.status)
          ? { in: query.status }
          : query.status;
      }

      if (query.priority) {
        where.priority = Array.isArray(query.priority)
          ? { in: query.priority }
          : query.priority;
      }

      if (query.projectId) {
        where.projectId = query.projectId;
      }

      if (query.goalId) {
        where.goalId = query.goalId;
      }

      if (query.search) {
        where.OR = [
          {
            title: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ];
      }

      return await this.prisma.task.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          goal: {
            select: {
              id: true,
              title: true,
            },
          },
          tags: {
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          },
          _count: {
            select: {
              subtasks: true,
              dependsOn: true,
              tags: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Task throughput for a date range: tasks created, completed, and still open
   * within [startDate, endDate] (inclusive). Completion uses completedAt, so a
   * task counts toward the period in which it was actually finished.
   */
  async getThroughput(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ created: number; completed: number; open: number }> {
    try {
      const [created, completed, open] = await Promise.all([
        this.prisma.task.count({
          where: {
            userId,
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        this.prisma.task.count({
          where: {
            userId,
            completedAt: { gte: startDate, lte: endDate },
          },
        }),
        this.prisma.task.count({
          where: {
            userId,
            status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.WAITING] },
          },
        }),
      ]);
      return { created, completed, open };
    } catch (error) {
      this.handleError(error, 'getThroughput');
    }
  }

  /**
   * Find a task with full relations
   */
  async findById(userId: string, taskId: string) {
    try {
      return await this.prisma.task.findFirst({
        where: { id: taskId, userId },
        include: {
          project: true,
          goal: true,
          parentTask: true,
          subtasks: true,
          dependsOn: {
            include: {
              dependsOn: true,
            },
          },
          blocks: {
            include: {
              task: true,
            },
          },
          tags: {
            include: { tag: true },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Update a task owned by the user
   */
  async update(
    userId: string,
    taskId: string,
    data: Prisma.TaskUpdateInput
  ): Promise<Task> {
    try {
      return await this.prisma.task.update({
        where: { id: taskId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a task owned by the user
   */
  async delete(userId: string, taskId: string): Promise<Task> {
    try {
      return await this.prisma.task.delete({
        where: { id: taskId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Archive a task (marks it as cancelled)
   */
  async archive(userId: string, taskId: string): Promise<Task> {
    try {
      return await this.prisma.task.update({
        where: { id: taskId, userId },
        data: { status: TaskStatus.CANCELLED },
      });
    } catch (error) {
      this.handleError(error, 'archive');
    }
  }

  /**
   * Complete a task
   */
  async complete(userId: string, taskId: string): Promise<Task> {
    try {
      return await this.prisma.task.update({
        where: { id: taskId, userId },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'complete');
    }
  }

  /**
   * Bulk create tasks for a user
   */
  async bulkCreate(
    userId: string,
    tasks: Array<Omit<Prisma.TaskCreateManyInput, 'userId'>>
  ): Promise<number> {
    try {
      const result = await this.prisma.task.createMany({
        data: tasks.map((task) => ({ ...task, userId })),
        skipDuplicates: true,
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'bulkCreate');
    }
  }

  /**
   * Replace the dependencies of a task
   */
  async setDependencies(
    userId: string,
    taskId: string,
    dependsOnIds: string[]
  ): Promise<number> {
    try {
      const task = await this.findById(userId, taskId);

      if (!task) {
        this.handleError(
          new Error(`Task ${taskId} not found for user`),
          'setDependencies'
        );
      }

      return await this.transaction(async (tx) => {
        await tx.taskDependency.deleteMany({
          where: { taskId },
        });

        const result = await tx.taskDependency.createMany({
          data: dependsOnIds.map((dependsOnId) => ({
            taskId,
            dependsOnId,
          })),
        });

        return result.count;
      });
    } catch (error) {
      this.handleError(error, 'setDependencies');
    }
  }

  /**
   * Get the dependencies of a task
   */
  async getDependencies(
    userId: string,
    taskId: string
  ): Promise<TaskDependency[]> {
    try {
      return await this.prisma.taskDependency.findMany({
        where: {
          taskId,
          task: { userId },
        },
        include: {
          dependsOn: true,
        },
        orderBy: { id: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getDependencies');
    }
  }

  /**
   * Update a task's status
   */
  async updateStatus(
    userId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<Task> {
    try {
      const data: Prisma.TaskUpdateInput = { status };

      if (status === TaskStatus.COMPLETED) {
        data.completedAt = new Date();
      }

      return await this.prisma.task.update({
        where: { id: taskId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateStatus');
    }
  }

  /**
   * List tasks belonging to a project
   */
  async listByProject(userId: string, projectId: string) {
    try {
      return await this.prisma.task.findMany({
        where: { userId, projectId },
        include: {
          tags: {
            include: { tag: true },
          },
          _count: {
            select: {
              subtasks: true,
              dependsOn: true,
            },
          },
        },
        orderBy: { dueDate: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'listByProject');
    }
  }
}