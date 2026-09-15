import prisma from '@/lib/prisma';

export abstract class BaseRepository<T, CreateInput, UpdateInput> {
  protected constructor(protected readonly model: any) {}

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({
      where: { id },
    });
  }

  async findMany(args: any): Promise<T[]> {
    return this.model.findMany(args);
  }

  async create(data: CreateInput): Promise<T> {
    return this.model.create({
      data,
    });
  }

  async update(id: string, data: UpdateInput): Promise<T> {
    return this.model.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<T> {
    return this.model.delete({
      where: { id },
    });
  }
}
