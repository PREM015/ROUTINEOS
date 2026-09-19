import type { Template, RoutineTemplate, Prisma, TemplateType } from '@prisma/client';
import { DayType } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Template Repository
 * Database operations for Template and RoutineTemplate models
 */

interface CreateTemplateData {
  type: TemplateType;
  name: string;
  description?: string;
  category?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  content: string;
  tags?: string[];
}

interface TemplateQueryParams {
  category?: string;
  search?: string;
  isPublic?: boolean;
  limit?: number;
  offset?: number;
}

interface CreateRoutineData {
  name: string;
  dayType?: DayType;
  description?: string;
  color?: string;
  icon?: string;
  estimatedDuration?: number;
}

interface RoutineBlockTemplateData {
  startTime: string;
  endTime: string;
  title: string;
  isOvernight?: boolean;
  description?: string | null;
  notes?: string | null;
  sortOrder?: number;
  color?: string | null;
  icon?: string | null;
  energyLevel?: string | null;
  trackCompletion?: boolean;
  isRecurring?: boolean;
  categoryId?: string | null;
}

interface RoutineTemplateContent {
  name?: string;
  description?: string;
  dayType?: DayType;
  color?: string;
  icon?: string;
  estimatedDuration?: number;
  blocks?: RoutineBlockTemplateData[];
}

export class TemplateRepository extends BaseRepository {
  /**
   * Create a template, optionally as a system-wide template
   */
  async createTemplate(
    userId: string | null | undefined,
    data: CreateTemplateData,
    isSystem = false
  ): Promise<Template> {
    try {
      return await this.prisma.template.create({
        data: {
          type: data.type,
          name: data.name,
          description: data.description,
          category: data.category,
          isPublic: isSystem ? true : (data.isPublic ?? false),
          isOfficial: isSystem,
          isFeatured: data.isFeatured,
          content: data.content,
          tags: data.tags ? JSON.stringify(data.tags) : undefined,
          ...(userId && !isSystem
            ? { user: { connect: { id: userId } } }
            : {}),
        },
      });
    } catch (error) {
      this.handleError(error, 'createTemplate');
    }
  }

  /**
   * Find templates accessible to a user with optional filters
   */
  async findAll(
    userId: string | null | undefined,
    query: TemplateQueryParams = {}
  ) {
    try {
      const filters: Prisma.TemplateWhereInput[] = [];

      if (query.isPublic === true) {
        filters.push({ isPublic: true });
      } else if (query.isPublic === false) {
        filters.push(
          userId
            ? { userId, isPublic: false }
            : { userId: null, isPublic: false }
        );
      } else if (userId) {
        filters.push({ OR: [{ userId }, { isPublic: true }] });
      } else {
        filters.push({ isPublic: true });
      }

      if (query.category) {
        filters.push({ category: query.category });
      }

      if (query.search) {
        filters.push({
          OR: [
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
          ],
        });
      }

      return await this.prisma.template.findMany({
        where: { AND: filters },
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Find a template that belongs to the user or is system-owned
   */
  async findById(
    userId: string | null | undefined,
    templateId: string
  ): Promise<Template | null> {
    try {
      const where: Prisma.TemplateWhereInput = userId
        ? { id: templateId, OR: [{ userId }, { userId: null }] }
        : { id: templateId, userId: null };

      return await this.prisma.template.findFirst({ where });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Find system templates
   */
  async findBySystem(limit?: number, offset?: number): Promise<Template[]> {
    try {
      return await this.prisma.template.findMany({
        where: { isPublic: true, isOfficial: true },
        orderBy: { usageCount: 'desc' },
        ...this.buildPaginationQuery(limit, offset),
      });
    } catch (error) {
      this.handleError(error, 'findBySystem');
    }
  }

  /**
   * Update a template owned by the user
   */
  async update(
    userId: string,
    templateId: string,
    data: Prisma.TemplateUpdateInput
  ): Promise<Template> {
    try {
      return await this.prisma.template.update({
        where: { id: templateId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a template owned by the user
   */
  async delete(userId: string, templateId: string): Promise<Template> {
    try {
      return await this.prisma.template.delete({
        where: { id: templateId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Create a routine from a template's content
   */
  async createRoutineFromTemplate(
    userId: string,
    templateId: string,
    data: CreateRoutineData
  ): Promise<RoutineTemplate> {
    try {
      const template = await this.findById(userId, templateId);

      if (!template) {
        this.handleError(
          new Error(`Template ${templateId} not found for user`),
          'createRoutineFromTemplate'
        );
      }

      let parsed: RoutineTemplateContent = {};
      try {
        parsed = JSON.parse(template.content) as RoutineTemplateContent;
      } catch {
        parsed = {};
      }

      const blockInputs: Prisma.RoutineBlockCreateWithoutTemplateInput[] = (
        parsed.blocks ?? []
      )
        .filter((block) => block.startTime && block.endTime && block.title)
        .map((block) => ({
          user: { connect: { id: userId } },
          startTime: block.startTime,
          endTime: block.endTime,
          title: block.title,
          isOvernight: block.isOvernight,
          description: block.description,
          notes: block.notes,
          sortOrder: block.sortOrder,
          color: block.color,
          icon: block.icon,
          energyLevel: block.energyLevel,
          trackCompletion: block.trackCompletion,
          isRecurring: block.isRecurring,
          category: block.categoryId
            ? { connect: { id: block.categoryId } }
            : undefined,
        }));

      return await this.prisma.routineTemplate.create({
        data: {
          user: { connect: { id: userId } },
          name: data.name || parsed.name || template.name,
          description:
            data.description ?? parsed.description ?? template.description,
          dayType: data.dayType ?? parsed.dayType ?? DayType.CUSTOM,
          color: data.color ?? parsed.color,
          icon: data.icon ?? parsed.icon,
          estimatedDuration:
            data.estimatedDuration ?? parsed.estimatedDuration,
          blocks:
            blockInputs.length > 0 ? { create: blockInputs } : undefined,
        },
      });
    } catch (error) {
      this.handleError(error, 'createRoutineFromTemplate');
    }
  }

  /**
   * Increment a template's usage count
   */
  async incrementUseCount(templateId: string): Promise<Template> {
    try {
      return await this.prisma.template.update({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } },
      });
    } catch (error) {
      this.handleError(error, 'incrementUseCount');
    }
  }

  /**
   * List public templates sorted by usage
   */
  async listPublic(limit?: number, offset?: number): Promise<Template[]> {
    try {
      return await this.prisma.template.findMany({
        where: { isPublic: true },
        orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
        ...this.buildPaginationQuery(limit, offset),
      });
    } catch (error) {
      this.handleError(error, 'listPublic');
    }
  }
}