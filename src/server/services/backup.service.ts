import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ExportFormat, ExportStatus, type DataExport } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { UserRepository } from '@/server/repositories/user.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import {
  exportUserData,
  exportToJSON,
  exportHabitsToCSV,
} from '@/server/data/exporter';

/**
 * Backup Service
 * Export user data to JSON/CSV files and track them as DataExport rows
 */

const MAX_EXPORT_BYTES = 50 * 1024 * 1024;
const EXPIRATION_DAYS = 7;

const exportRequestSchema = z.object({
  format: z.enum(['JSON', 'CSV', 'PDF', 'MARKDOWN']),
  includeAttachments: z.boolean().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export interface CreateExportInput {
  format: ExportFormat;
  includeAttachments?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

function extensionFor(format: ExportFormat): string {
  switch (format) {
    case ExportFormat.JSON:
      return 'json';
    case ExportFormat.CSV:
      return 'csv';
    case ExportFormat.MARKDOWN:
      return 'md';
    default:
      return 'pdf';
  }
}

function publicBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ?? '';
}

export class BackupService {
  private userRepository: UserRepository;
  private journalRepository: JournalRepository;
  private streakRepository: StreakRepository;
  private achievementRepository: AchievementRepository;
  private auditRepository: AuditRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.journalRepository = new JournalRepository();
    this.streakRepository = new StreakRepository();
    this.achievementRepository = new AchievementRepository();
    this.auditRepository = new AuditRepository();
  }

  private exportsDirFor(userId: string): string {
    return path.join(process.cwd(), 'public', 'uploads', 'exports', userId);
  }

  private publicUrlFor(userId: string, fileName: string): string {
    return `/uploads/exports/${userId}/${fileName}`;
  }

  private async serializeExport(
    userId: string,
    format: ExportFormat,
    dateFrom?: string,
    dateTo?: string
  ): Promise<string> {
    const base = await exportUserData(userId, {
      startDate: dateFrom,
      endDate: dateTo,
    });

    const [journalEntries, streak, achievements] = await Promise.all([
      this.journalRepository.findAll(userId, { limit: 500 }),
      this.streakRepository.findByUserId(userId),
      this.achievementRepository.findByUserId(userId),
    ]);

    const enriched = {
      ...base,
      journalEntries,
      streak,
      achievements,
    };

    if (format === ExportFormat.JSON) {
      return exportToJSON(enriched);
    }

    if (format === ExportFormat.CSV) {
      const habits = 'habits' in enriched ? enriched.habits : [];
      return exportHabitsToCSV(habits);
    }

    throw new Error(
      `Export format "${format}" is not supported yet. Try JSON or CSV.`
    );
  }

  /**
   * Create an export, write it to disk and mark it completed
   */
  async createExport(
    userId: string,
    input: CreateExportInput
  ): Promise<{ exportId: string; downloadUrl: string; format: ExportFormat }> {
    const parsed = exportRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(
        parsed.error.errors[0]?.message ?? 'Invalid export request'
      );
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const exportRow = await prisma.dataExport.create({
      data: {
        userId,
        format: parsed.data.format,
        status: ExportStatus.PROCESSING,
        includeAttachments: parsed.data.includeAttachments ?? false,
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
        startedAt: new Date(),
      },
    });

    try {
      const serialized = await this.serializeExport(
        userId,
        parsed.data.format,
        parsed.data.dateFrom,
        parsed.data.dateTo
      );

      const fileBytes = Buffer.byteLength(serialized, 'utf8');
      if (fileBytes > MAX_EXPORT_BYTES) {
        throw new Error(
          `Export exceeds the ${Math.floor(MAX_EXPORT_BYTES / 1024 / 1024)}MB limit`
        );
      }

      const fileName = `backup-${exportRow.id}.${extensionFor(parsed.data.format)}`;
      const dir = this.exportsDirFor(userId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, fileName), serialized, 'utf8');

      const fileUrl = this.publicUrlFor(userId, fileName);

      await prisma.dataExport.update({
        where: { id: exportRow.id },
        data: {
          status: ExportStatus.COMPLETED,
          fileUrl,
          fileSize: fileBytes,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + EXPIRATION_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      await this.auditRepository.create({
        userId,
        action: 'DATA_EXPORTED',
        entityType: 'DATA_EXPORT',
        entityId: exportRow.id,
        metadata: { format: parsed.data.format },
      });

      return {
        exportId: exportRow.id,
        downloadUrl: `${publicBaseUrl() ?? ''}${fileUrl}`,
        format: parsed.data.format,
      };
    } catch (error) {
      await prisma.dataExport.update({
        where: { id: exportRow.id },
        data: {
          status: ExportStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Export failed',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * List all exports for a user
   */
  async getExports(userId: string): Promise<DataExport[]> {
    return prisma.dataExport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single export owned by the user
   */
  async getExport(userId: string, exportId: string): Promise<DataExport> {
    const exportRow = await prisma.dataExport.findUnique({
      where: { id: exportId },
    });
    if (!exportRow || exportRow.userId !== userId) {
      throw new Error('Export not found');
    }
    return exportRow;
  }

  /**
   * Delete an export row and its backing file
   */
  async deleteExport(
    userId: string,
    exportId: string
  ): Promise<{ success: boolean }> {
    const exportRow = await this.getExport(userId, exportId);

    if (exportRow.fileUrl) {
      const fileName = path.basename(exportRow.fileUrl);
      try {
        await fs.unlink(path.join(this.exportsDirFor(userId), fileName));
      } catch (error) {
        console.warn('Failed to remove export file:', error);
      }
    }

    await prisma.dataExport.delete({ where: { id: exportRow.id } });
    return { success: true };
  }
}

export const backupService = new BackupService();