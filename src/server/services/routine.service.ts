import { routineRepository } from '../repositories/routine.repository';

export class RoutineService {
  async createTemplate(userId: string, data: any) {
    return routineRepository.createTemplate({ userId, ...data });
  }

  async updateTemplate(id: string, data: any) {
    return routineRepository.updateTemplate(id, data);
  }

  async getTemplateForDate(userId: string, dateStr: string) {
    const date = new Date(dateStr);
    const dayType = [0, 6].includes(date.getDay()) ? 'WEEKEND' : 'WEEKDAY';
    const templates = await routineRepository.findTemplatesByUserId(userId);
    return templates.find(t => t.dayType === dayType || t.dayType === 'ALL') || null;
  }

  async logBlock(userId: string, blockId: string, date: string, data: any) {
    const prisma = require('@/lib/prisma').default;
    return prisma.routineLog.upsert({
      where: { blockId_date: { blockId, date } },
      update: data,
      create: { userId, blockId, date, ...data },
    });
  }

  async detectConflicts(userId: string, date: string) {
    const template = await this.getTemplateForDate(userId, date);
    if (!template) return [];
    const blocks = template.blocks.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const conflicts = [];
    for (let i = 0; i < blocks.length - 1; i++) {
      if (blocks[i].endTime > blocks[i + 1].startTime) {
        conflicts.push({ b1: blocks[i].id, b2: blocks[i + 1].id });
      }
    }
    return conflicts;
  }

  async getTodayRoutine(userId: string) {
    const dateStr = new Date().toISOString().split('T')[0];
    return this.getTemplateForDate(userId, dateStr);
  }
}

export const routineService = new RoutineService();
