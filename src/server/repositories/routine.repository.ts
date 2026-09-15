import prisma from '@/lib/prisma';

export class RoutineRepository {
  async findTemplateById(id: string) {
    return prisma.routineTemplate.findUnique({ where: { id }, include: { blocks: true } });
  }

  async findTemplatesByUserId(userId: string) {
    return prisma.routineTemplate.findMany({ where: { userId }, include: { blocks: true } });
  }

  async createTemplate(data: any) {
    return prisma.routineTemplate.create({ data });
  }

  async updateTemplate(id: string, data: any) {
    return prisma.routineTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: string) {
    return prisma.routineTemplate.delete({ where: { id } });
  }

  async findBlocksByTemplateId(templateId: string) {
    return prisma.routineBlock.findMany({ where: { templateId }, orderBy: { order: 'asc' } });
  }

  async createBlock(data: any) {
    return prisma.routineBlock.create({ data });
  }

  async updateBlock(id: string, data: any) {
    return prisma.routineBlock.update({ where: { id }, data });
  }

  async deleteBlock(id: string) {
    return prisma.routineBlock.delete({ where: { id } });
  }

  async findExceptions(userId: string, date: string) {
    return prisma.routineException.findMany({ where: { userId, date } });
  }

  async findLogsByDate(userId: string, date: string) {
    return prisma.routineLog.findMany({ where: { userId, date } });
  }
}

export const routineRepository = new RoutineRepository();
