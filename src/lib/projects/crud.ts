import type { Prisma, ProjectStatus } from '@prisma/client';
import { ProjectRepository } from '@/server/repositories/project.repository';
import {
  createProjectSchema,
  updateProjectSchema,
  milestoneSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  type MilestoneInput,
} from '@/schemas/project.schema';
import type { ProjectWithRelations, MilestoneWithGoal } from '@/types/projects';

/**
 * Project CRUD operations.
 * Validates input with Zod and delegates persistence to the repository.
 */

const projectRepository = new ProjectRepository();

/**
 * Create a project owned by the user.
 */
export async function createProject(
  userId: string,
  input: CreateProjectInput
): Promise<ProjectWithRelations> {
  const data = createProjectSchema.parse(input);
  const created = await projectRepository.create(userId, {
    name: data.name,
    description: data.description,
    status: data.status,
    priority: data.priority,
    categoryId: data.categoryId,
    color: data.color,
    icon: data.icon,
    startDate: data.startDate,
    endDate: data.endDate,
  });
  return (await projectRepository.findById(userId, created.id)) as ProjectWithRelations;
}

/**
 * Update a project owned by the user.
 */
export async function updateProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput
): Promise<ProjectWithRelations> {
  const data = updateProjectSchema.parse(input);

  const updateData: Prisma.ProjectUpdateInput = {
    name: data.name ?? undefined,
    description: data.description ?? undefined,
    status: data.status,
    priority: data.priority,
    color: data.color ?? undefined,
    icon: data.icon ?? undefined,
    startDate: data.startDate ?? undefined,
    endDate: data.endDate ?? undefined,
    progress: data.progress ?? undefined,
  };
  if (data.categoryId !== undefined) {
    updateData.category = { connect: { id: data.categoryId } };
  }

  await projectRepository.update(userId, projectId, updateData);
  return (await projectRepository.findById(userId, projectId)) as ProjectWithRelations;
}

export interface ListProjectsFilters {
  search?: string;
  status?: ProjectStatus | ProjectStatus[];
  categoryId?: string;
  limit?: number;
  offset?: number;
}

/**
 * List projects matching the given filters.
 */
export async function listProjects(
  userId: string,
  filters: ListProjectsFilters = {}
): Promise<ProjectWithRelations[]> {
  const projects = (await projectRepository.findAll(userId, {
    search: filters.search,
    status: filters.status,
    limit: filters.limit,
    offset: filters.offset,
  })) as ProjectWithRelations[];

  if (filters.categoryId === undefined) return projects;
  return projects.filter(project => project.category?.id === filters.categoryId);
}

/**
 * Fetch a single project owned by the user, or `null` when not found.
 */
export async function getProject(
  userId: string,
  projectId: string
): Promise<ProjectWithRelations | null> {
  return (await projectRepository.findById(userId, projectId)) as ProjectWithRelations | null;
}

/**
 * Delete a project owned by the user.
 */
export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await projectRepository.delete(userId, projectId);
}

/**
 * Soft-archive a project.
 */
export async function archiveProject(userId: string, projectId: string): Promise<void> {
  await projectRepository.archive(userId, projectId);
}

/**
 * Set a project's status, applying completion/archive timestamps as needed.
 */
export async function setProjectStatus(
  userId: string,
  projectId: string,
  status: ProjectStatus
): Promise<ProjectWithRelations> {
  await projectRepository.updateStatus(userId, projectId, status);
  return (await projectRepository.findById(userId, projectId)) as ProjectWithRelations;
}

/**
 * Set a project's progress override (0-100).
 */
export async function updateProjectProgress(
  userId: string,
  projectId: string,
  progress: number
): Promise<void> {
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new RangeError('progress must be between 0 and 100');
  }
  await projectRepository.update(userId, projectId, { progress });
}

/**
 * Add a milestone to one of the project's goals.
 */
export async function addProjectMilestone(
  userId: string,
  projectId: string,
  goalId: string,
  input: MilestoneInput
): Promise<void> {
  const data = milestoneSchema.parse(input);
  await projectRepository.addMilestone(userId, projectId, {
    goalId,
    title: data.title,
    description: data.description,
    dueDate: data.dueDate,
  });
}

/**
 * List the milestones across a project's goals.
 */
export async function getProjectMilestones(
  userId: string,
  projectId: string
): Promise<MilestoneWithGoal[]> {
  return (await projectRepository.getMilestones(userId, projectId)) as MilestoneWithGoal[];
}