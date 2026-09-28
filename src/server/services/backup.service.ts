import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ExportFormat, ExportStatus, type DataExport } from '@/generated/prisma';
import { z } from 'zod';
import { UserRepository } from '@/server/repositories/user.repository';
import { DataExportRepository } from '@/server/repositories/data-export.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import {
  exportUserData,
  exportToJSON,
  exportHabitsToCSV,
  exportToMarkdown,
} from '@/server/data/exporter';

/**
 * Backup Service
 * Export user data to JSON/CSV files and track them as DataExport rows
 */

const MAX_EXPORT_BYTES = 50 * 1024 * 1024;
const EXPIRATION_DAYS = 7;

/**
 * Formats the exporter can actually produce.
 *
 * `PDF` remains in the `ExportFormat` enum but has no renderer, so it is
 * rejected here with a clear 400 instead of being accepted, failing deep inside
 * serialization, and leaving the export row in `FAILED`.
 */
const exportRequestSchema = z.object({
  format: z.enum(['JSON', 'CSV', 'MARKDOWN']),
  includeAttachments: z.boolean().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
  private dataExportRepository: DataExportRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.journalRepository = new JournalRepository();
    this.streakRepository = new StreakRepository();
    this.achievementRepository = new AchievementRepository();
    this.auditRepository = new AuditRepository();
    this.dataExportRepository = new DataExportRepository();
  }

  /**
   * Directory holding a user's completed data exports.
   *
   * SECURITY: this was `public/uploads/exports/<userId>`. Next.js serves
   * everything under `public/` as a static asset with **no authentication and
   * no middleware**, so a full data export — habits, goals, journal, sleep,
   * every timestamp — was reachable at `https://<host>/uploads/exports/<userId>/<file>`
   * by anyone who had that URL. The authenticated download route at
   * `/api/export/download/[id]` was correctly scoped to the session owner, but it
   * was guarding a copy of the file that was also readable directly.
   *
   * Exports are therefore written outside `public/`, so the only way to read one
   * is through the authorized API route. `.data/` is gitignored.
   */
  private exportsDirFor(userId: string): string {
    return path.join(process.cwd(), '.data', 'exports', userId);
  }

  /**
   * Stored file name recorded on `DataExport.fileUrl`.
   *
   * No longer a public path — it is only used to locate the file on disk
   * (`path.basename` in the download route) and must never be treated as a URL
   * a browser can fetch. Clients get `/api/export/download/<id>` instead.
   */
  private storedFileName(fileName: string): string {
    return fileName;
  }

  private async serializeExport(
    userId: string,
    format: ExportFormat,
    dateFrom?: string,
    dateTo?: string,
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

    if (format === ExportFormat.MARKDOWN) {
      return exportToMarkdown(enriched);
    }

    // PDF is still in the `ExportFormat` enum, but there is no PDF renderer in
    // the project and `exportRequestSchema` rejects it up front, so this is
    // unreachable via the API. Kept as a guard rather than silently emitting
    // a non-PDF file with a .pdf name.
    throw new Error(`Export format "${format}" is not supported yet. Try JSON, CSV, or MARKDOWN.`);
  }

  /**
   * Create an export, write it to disk and mark it completed
   */
  async createExport(
    userId: string,
    input: CreateExportInput,
  ): Promise<{
    exportId: string;
    downloadUrl: string;
    format: ExportFormat;
    fileUrl: string;
    fileSize: number | null;
    expiresAt: Date | null;
  }> {
    const parsed = exportRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.errors[0]?.message ?? 'Invalid export request');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const exportRow = await this.dataExportRepository.create({
      user: { connect: { id: userId } },
      format: parsed.data.format,
      status: ExportStatus.PROCESSING,
      includeAttachments: parsed.data.includeAttachments ?? false,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      startedAt: new Date(),
    });

    try {
      const serialized = await this.serializeExport(
        userId,
        parsed.data.format,
        parsed.data.dateFrom,
        parsed.data.dateTo,
      );

      const fileBytes = Buffer.byteLength(serialized, 'utf8');
      if (fileBytes > MAX_EXPORT_BYTES) {
        throw new Error(`Export exceeds the ${Math.floor(MAX_EXPORT_BYTES / 1024 / 1024)}MB limit`);
      }

      const fileName = `backup-${exportRow.id}.${extensionFor(parsed.data.format)}`;
      const dir = this.exportsDirFor(userId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, fileName), serialized, 'utf8');

      // Stores the *file name*, not a URL. See `storedFileName`.
      const fileUrl = this.storedFileName(fileName);

      const completed = await this.dataExportRepository.update(exportRow.id, {
        status: ExportStatus.COMPLETED,
        fileUrl,
        fileSize: fileBytes,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + EXPIRATION_DAYS * 24 * 60 * 60 * 1000),
      });

      await this.auditRepository.create({
        userId,
        action: 'DATA_EXPORTED',
        entityType: 'DATA_EXPORT',
        entityId: exportRow.id,
        metadata: { format: parsed.data.format },
      });

      return {
        exportId: completed.id,
        // Always the authorized API route. This used to be a direct
        // `/uploads/exports/...` link, which bypassed authentication entirely.
        downloadUrl: `${publicBaseUrl() ?? ''}/api/export/download/${completed.id}`,
        format: parsed.data.format,
        fileUrl,
        fileSize: completed.fileSize,
        expiresAt: completed.expiresAt,
      };
    } catch (error) {
      await this.dataExportRepository.update(exportRow.id, {
        status: ExportStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Export failed',
        completedAt: new Date(),
      });
      throw error;
    }
  }

  /**
   * List all exports for a user
   */
  async getExports(userId: string): Promise<DataExport[]> {
    return this.dataExportRepository.findAllByUser(userId);
  }

  /**
   * Get a single export owned by the user
   */
  async getExport(userId: string, exportId: string): Promise<DataExport> {
    const exportRow = await this.dataExportRepository.findById(exportId);
    if (!exportRow || exportRow.userId !== userId) {
      throw new Error('Export not found');
    }
    return exportRow;
  }

  /**
   * Delete an export row and its backing file
   */
  async deleteExport(userId: string, exportId: string): Promise<{ success: boolean }> {
    const exportRow = await this.getExport(userId, exportId);

    if (exportRow.fileUrl) {
      const fileName = path.basename(exportRow.fileUrl);
      try {
        await fs.unlink(path.join(this.exportsDirFor(userId), fileName));
      } catch (error) {
        console.warn('Failed to remove export file:', error);
      }
    }

    await this.dataExportRepository.delete(exportRow.id);
    return { success: true };
  }
}

export const backupService = new BackupService();
