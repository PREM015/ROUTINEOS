import prisma from '@/lib/prisma';
import { BaseRepository } from './base.repository';

export class UserRepository extends BaseRepository<any, any, any> {
  constructor() {
    super(prisma.user);
  }

  async findByEmail(email: string) {
    return this.model.findUnique({ where: { email } });
  }

  async findWithSettings(id: string) {
    return this.model.findUnique({
      where: { id },
      include: { settings: true },
    });
  }

  async updateSettings(userId: string, data: any) {
    return prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  async updateLastActivity(id: string) {
    return this.model.update({
      where: { id },
      data: { lastActiveAt: new Date() },
    });
  }
}

export const userRepository = new UserRepository();
