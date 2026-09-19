import type { Prisma, ProjectStatus } from '@prisma/client';
import { ProjectRepository } from '@/server/repositories/project.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import {
  createProjectSchema,
  updateProjectSchema,
  milestoneSchema,
} from '@/schemas/project.schema';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  MilestoneInput,
  ProjectQueryParams,
} from '@/schemas/project.schema';
import { calculateGoalProgress } from '@/server/domain/goal/goal-tracker';

/**
 * Project Service
 * Business logic for project and milestone management
 */

export class ProjectService {
  private projectRepository: ProjectRepository;
  private auditRepository: AuditRepository;

  constructor() {
    this.projectRepository = new ProjectRepository();
    this.auditRepository = new AuditRepository();
  }

  /**
   * Create a new project, optionally connecting existing goals
   */
  async createProject(
    userId: string,
    input: CreateProjectInput & { goalIds?: string[] }
  ) {
    const parsed = createProjectSchema.parse(input);

    const project = await this.projectRepository.create(userId, {
      name: parsed.name,
      description: parsed.description,
      status: parsed.status,
      priority: parsed.priority,
      categoryId: parsed.categoryId,
      color: parsed.color,
      icon: parsed.icon,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      goalIds: input.goalIds,
    });

    await this.auditRepository.create({
      userId,
      action: 'GOAL_CREATED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: input.goalIds?.length ? { goalIds: input.goalIds } : undefined,
    });

    return this.getProject(userId, project.id);
  }

  /**
   * List projects for a user with optional filters
   */
  async getProjects(userId: string, query: ProjectQueryParams = {}) {
    const parsed = projectQuerySchema.parse(query);

    const projects = await this.projectRepository.findAll(userId, {
      status: parsed.status,
      search: parsed.search,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    return parsed.categoryId
      ? projects.filter((p) => p.categoryId === parsed.categoryId)
      : projects;
  }

  /**
   * Get a single project with goals and milestones
   */
  async getProject(userId: string, projectId: string) {
    const project = await this.projectRepository.findById(userId, projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }

  /**
   * Update a project owned by the user
   */
  async updateProject(
    userId: string,
    projectId: string,
    input: UpdateProjectInput
  ) {
    await this.getProject(userId, projectId);

    const parsed = updateProjectSchema.parse(input);

    const data: Prisma.ProjectUpdateInput = {
      ...(parsed.name && { name: parsed.name }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.status && { status: parsed.status }),
      ...(parsed.priority && { priority: parsed.priority }),
      ...(parsed.categoryId !== undefined && {
        category: parsed.categoryId
          ? { connect: { id: parsed.categoryId } }
          : { disconnect: true },
      }),
      ...(parsed.color && { color: parsed.color }),
      ...(parsed.icon && { icon: parsed.icon }),
      ...(parsed.startDate && { startDate: parsed.startDate }),
      ...(parsed.endDate !== undefined && { endDate: parsed.endDate ?? null }),
      ...(parsed.progress !== undefined && { progress: parsed.progress }),
    };

    await this.projectRepository.update(userId, projectId, data);

    await this.auditRepository.create({
      userId,
      action: 'GOAL_UPDATED',
      entityType: 'PROJECT',
      entityId: projectId,
    });

    return this.getProject(userId, projectId);
  }

  /**
   * Archive a project
   */
  async archiveProject(userId: string, projectId: string) {
    await this.getProject(userId, projectId);

    await this.projectRepository.archive(userId, projectId);

    await this.auditRepository.create({
      userId,
      action: 'GOAL_UPDATED',
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: { status: 'ARCHIVED' },
    });

    return this.getProject(userId, projectId);
  }

  /**
   * Delete a project (permanently removes it)
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    await this.getProject(userId, projectId);

    await this.projectRepository.delete(userId, projectId);

    await this.auditRepository.create({
      userId,
      action: 'GOAL_DELETED',
      entityType: 'PROJECT',
      entityId: projectId,
    });
  }

  /**
   * Update a project's status (active, on hold, completed, archived...)
   */
  async updateStatus(userId: string, projectId: string, status: ProjectStatus) {
    await this.getProject(userId, projectId);

    return this.projectRepository.updateStatus(userId, projectId, status);
  }

  /**
   * Get milestones for a project's goals
   */
  async getMilestones(userId: string, projectId: string) {
    await this.getProject(userId, projectId);

    return this.projectRepository.getMilestones(userId, projectId);
  }

  /**
   * Add a milestone to a goal within the user's project
   */
  async addMilestone(
    userId: string,
    projectId: string,
    goalId: string,
    input: MilestoneInput
  ) {
    const parsed = milestoneSchema.parse(input);

    return this.projectRepository.addMilestone(userId, projectId, {
      goalId,
      title: parsed.title,
      description: parsed.description,
      dueDate: parsed.dueDate,
      sortOrder: parsed.sortOrder,
    });
  }

  /**
   * Update a milestone owned by the user (through its goal)
   */
  async updateMilestone(
    userId: string,
    milestoneId: string,
    input: Partial<MilestoneInput>
  ) {
    const parsed = milestoneSchema.partial().parse(input);

    const data: Prisma.MilestoneUpdateInput = {
      ...(parsed.title && { title: parsed.title }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.targetValue !== undefined && { targetValue: parsed.targetValue }),
      ...(parsed.dueDate !== undefined && { dueDate: parsed.dueDate }),
    };

    return this.projectRepository.updateMilestone(milestoneId, userId, data);
  }

  /**
   * Delete a milestone owned by the user (through its goal)
   */
  async deleteMilestone(userId: string, milestoneId: string): Promise<void> {
    const count = await this.projectRepository.deleteMilestone(milestoneId, userId);
    if (count === 0) {
      throw new Error('Milestone not found');
    }
  }

  /**
   * Get aggregated stats for a project (goal + task + milestone progress)
   */
  async getProjectStats(userId: string, projectId: string) {
    const project = await this.getProject(userId, projectId);

    const tasks = project.tasks;
    const goals = project.goals;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const waitingTasks = tasks.filter((t) => t.status === 'WAITING').length;

    const now = new Date();
    const overdueTasks = tasks.filter(
      (t) =>
        t.dueDate &&
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED' &&
        new Date(t.dueDate) < now
    ).length;

    const totalGoals = goals.length;
    const completedGoals = goals.filter((g) => g.status === 'COMPLETED').length;
    const activeGoals = goals.filter((g) => g.status === 'ACTIVE').length;

    const goalProgressPercentage =
      totalGoals > 0
        ? goals.reduce(
            (sum, g) =>
              sum +
              calculateGoalProgress('VALUE', g.currentValue, g.targetValue).percentage,
            0
          ) / totalGoals
        : 0;

    const totalMilestones = goals.reduce((sum, g) => sum + g.milestones.length, 0);
    const completedMilestones = goals.reduce(
      (sum, g) => sum + g.milestones.filter((m) => m.completedAt).length,
      0
    );

    return {
      projectId,
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        waiting: waitingTasks,
        overdue: overdueTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      },
      goals: {
        total: totalGoals,
        completed: completedGoals,
        active: activeGoals,
        completionRate: totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0,
        averageProgress: Math.round(goalProgressPercentage * 10) / 10,
      },
      milestones: {
        total: totalMilestones,
        completed: completedMilestones,
        completionRate:
          totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
      },
    };
  }
}