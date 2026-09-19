import type { Project, Milestone, Prisma, GoalPriority } from '@prisma/client';
import { ProjectStatus } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Project Repository
 * Database operations for Project, Goal and Milestone models
 */

interface CreateProjectData {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: GoalPriority;
  categoryId?: string;
  color?: string;
  icon?: string;
  startDate?: Date;
  endDate?: Date;
  goalIds?: string[];
}

interface ProjectQueryParams {
  status?: ProjectStatus | ProjectStatus[];
  search?: string;
  limit?: number;
  offset?: number;
}

interface CreateMilestoneData {
  goalId: string;
  title: string;
  description?: string;
  dueDate?: Date;
  sortOrder?: number;
}

export class ProjectRepository extends BaseRepository {
  /**
   * Create a project with optional goal connections
   */
  async create(userId: string, data: CreateProjectData): Promise<Project> {
    try {
      const goalIds = data.goalIds ?? [];

      return await this.prisma.project.create({
        data: {
          name: data.name,
          description: data.description,
          status: data.status,
          priority: data.priority,
          color: data.color,
          icon: data.icon,
          startDate: data.startDate,
          endDate: data.endDate,
          category: data.categoryId
            ? { connect: { id: data.categoryId } }
            : undefined,
          goals:
            goalIds.length > 0
              ? { connect: goalIds.map((id) => ({ id })) }
              : undefined,
          user: { connect: { id: userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find all projects for a user with optional filters
   */
  async findAll(userId: string, query: ProjectQueryParams = {}) {
    try {
      const where: Prisma.ProjectWhereInput = { userId };

      if (query.status) {
        where.status = Array.isArray(query.status)
          ? { in: query.status }
          : query.status;
      }

      if (query.search) {
        where.OR = [
          {
            name: {
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

      return await this.prisma.project.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          _count: {
            select: {
              goals: true,
              tasks: true,
              timeEntries: true,
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
   * Find a project with goals and milestones
   */
  async findById(userId: string, projectId: string) {
    try {
      return await this.prisma.project.findFirst({
        where: { id: projectId, userId },
        include: {
          category: true,
          goals: {
            include: {
              milestones: {
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
          tasks: true,
          timeEntries: true,
          _count: {
            select: {
              goals: true,
              tasks: true,
              timeEntries: true,
            },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Update a project owned by the user
   */
  async update(
    userId: string,
    projectId: string,
    data: Prisma.ProjectUpdateInput
  ): Promise<Project> {
    try {
      return await this.prisma.project.update({
        where: { id: projectId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a project owned by the user
   */
  async delete(userId: string, projectId: string): Promise<Project> {
    try {
      return await this.prisma.project.delete({
        where: { id: projectId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Soft-archive a project
   */
  async archive(userId: string, projectId: string): Promise<Project> {
    try {
      return await this.prisma.project.update({
        where: { id: projectId, userId },
        data: {
          status: ProjectStatus.ARCHIVED,
          archivedAt: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'archive');
    }
  }

  /**
   * Update a project's status, setting timestamps where relevant
   */
  async updateStatus(
    userId: string,
    projectId: string,
    status: ProjectStatus
  ): Promise<Project> {
    try {
      const data: Prisma.ProjectUpdateInput = { status };

      if (status === ProjectStatus.COMPLETED) {
        data.completedAt = new Date();
      }

      if (status === ProjectStatus.ARCHIVED) {
        data.archivedAt = new Date();
      }

      return await this.prisma.project.update({
        where: { id: projectId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateStatus');
    }
  }

  /**
   * Get milestones for a project's goals
   */
  async getMilestones(userId: string, projectId: string) {
    try {
      return await this.prisma.milestone.findMany({
        where: {
          goal: {
            userId,
            projectId,
          },
        },
        include: {
          goal: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getMilestones');
    }
  }

  /**
   * Add a milestone to a goal in the user's project
   */
  async addMilestone(
    userId: string,
    projectId: string,
    data: CreateMilestoneData
  ): Promise<Milestone> {
    try {
      const goal = await this.prisma.goal.findFirst({
        where: { id: data.goalId, userId, projectId },
      });

      if (!goal) {
        this.handleError(
          new Error(
            `Goal ${data.goalId} not found in project ${projectId} for user`
          ),
          'addMilestone'
        );
      }

      return await this.prisma.milestone.create({
        data: {
          title: data.title,
          description: data.description,
          dueDate: data.dueDate,
          sortOrder: data.sortOrder,
          goal: { connect: { id: data.goalId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'addMilestone');
    }
  }

  /**
   * Update a milestone owned by the user (through its goal)
   */
  async updateMilestone(
    milestoneId: string,
    userId: string,
    data: Prisma.MilestoneUpdateInput
  ): Promise<Milestone> {
    try {
      const milestone = await this.prisma.milestone.findFirst({
        where: { id: milestoneId, goal: { userId } },
      });

      if (!milestone) {
        this.handleError(
          new Error(`Milestone ${milestoneId} not found for user`),
          'updateMilestone'
        );
      }

      return await this.prisma.milestone.update({
        where: { id: milestoneId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateMilestone');
    }
  }

  /**
   * Delete a milestone owned by the user (through its goal)
   */
  async deleteMilestone(
    milestoneId: string,
    userId: string
  ): Promise<number> {
    try {
      const result = await this.prisma.milestone.deleteMany({
        where: { id: milestoneId, goal: { userId } },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'deleteMilestone');
    }
  }

  /**
   * Get goals belonging to a project
   */
  async getGoals(userId: string, projectId: string) {
    try {
      return await this.prisma.goal.findMany({
        where: { userId, projectId },
        include: {
          milestones: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { endDate: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getGoals');
    }
  }
}