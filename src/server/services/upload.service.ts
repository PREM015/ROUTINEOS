import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Attachment } from '@prisma/client';
import prisma from '@/lib/prisma';
import { UserRepository } from '@/server/repositories/user.repository';

/**
 * Upload Service
 * Validate, store and serve file uploads persisted under public/uploads
 */

const DEFAULT_MAX_SIZE_MB = 10;

const DISALLOWED_EXTENSIONS = [
  'exe',
  'bat',
  'cmd',
  'com',
  'sh',
  'msi',
  'ps1',
  'vbs',
  'jar',
  'dll',
  'scr',
  'apk',
  'hta',
  'cpl',
  'reg',
];

const DISALLOWED_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/x-script.ps1',
  'application/x-java-archive',
];

export interface UploadFileInput {
  fileName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

export interface CreateAttachmentInput {
  entityType?: string;
  entityId?: string;
  storageKey?: string;
}

function maxUploadSizeBytes(): number {
  const raw = process.env.UPLOAD_MAX_SIZE;
  const mb = raw ? Number(raw) : NaN;
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
}

function allowedMimeTypes(): string[] {
  const raw = process.env.ALLOWED_FILE_TYPES;
  if (!raw) return [];
  return raw
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  return base.length > 0 ? base : 'file';
}

function extensionOf(fileName: string): string {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return ext;
}

export class UploadService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Validate a file against size and type allow/deny lists
   */
  async validateFile(file: UploadFileInput): Promise<void> {
    if (!file || typeof file.buffer === 'undefined') {
      throw new Error('No file provided');
    }
    if (file.size > maxUploadSizeBytes()) {
      throw new Error(
        `File exceeds the ${Math.floor(maxUploadSizeBytes() / 1024 / 1024)}MB limit`
      );
    }
    if (file.size <= 0) {
      throw new Error('Empty files are not allowed');
    }

    const ext = extensionOf(file.fileName);
    if (DISALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`File type .${ext} is not allowed`);
    }
    if (DISALLOWED_MIME_TYPES.includes(file.mimeType.toLowerCase())) {
      throw new Error('This file type is not allowed');
    }

    const allowed = allowedMimeTypes();
    if (allowed.length > 0 && !allowed.includes(file.mimeType.toLowerCase())) {
      throw new Error(`File type "${file.mimeType}" is not allowed`);
    }
  }

  private uploadsDirFor(userId: string): string {
    return path.join(process.cwd(), 'public', 'uploads', userId);
  }

  private publicUrlFor(userId: string, fileName: string): string {
    return `/uploads/${userId}/${fileName}`;
  }

  /**
   * Persist a file to disk and return its served URL.
   * Falls back to an in-memory reference if writing fails.
   */
  async storeFile(
    userId: string,
    attachmentId: string,
    file: UploadFileInput
  ): Promise<{ storageKey: string | null; publicUrl: string }> {
    const safeName = sanitizeFileName(file.fileName);
    const storedName = `${attachmentId}-${safeName}`;
    const publicUrl = this.publicUrlFor(userId, storedName);
    const dir = this.uploadsDirFor(userId);

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, storedName), file.buffer);
      return { storageKey: storedName, publicUrl };
    } catch (error) {
      console.warn('Failed to persist upload to disk:', error);
      return { storageKey: null, publicUrl };
    }
  }

  /**
   * Validate, store the file and create the Attachment row
   */
  async createAttachment(
    userId: string,
    file: UploadFileInput,
    input: CreateAttachmentInput = {}
  ): Promise<Attachment> {
    await this.validateFile(file);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const attachment = await prisma.attachment.create({
      data: {
        userId,
        entityType: input.entityType ?? 'GENERAL',
        entityId: input.entityId ?? 'none',
        fileName: sanitizeFileName(file.fileName),
        fileUrl: '', // filled in below
        fileSize: file.size,
        mimeType: file.mimeType.toLowerCase(),
        storageKey: input.storageKey,
      },
    });

    const { storageKey, publicUrl } = await this.storeFile(
      userId,
      attachment.id,
      file
    );

    return prisma.attachment.update({
      where: { id: attachment.id },
      data: { fileUrl: publicUrl, storageKey: storageKey ?? input.storageKey },
    });
  }

  /**
   * Fetch an attachment with an ownership check
   */
  async getAttachment(userId: string, attachmentId: string): Promise<Attachment> {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.userId !== userId) {
      throw new Error('Attachment not found');
    }
    return attachment;
  }

  /**
   * Delete an attachment row and its backing file
   */
  async deleteAttachment(
    userId: string,
    attachmentId: string
  ): Promise<{ success: boolean }> {
    const attachment = await this.getAttachment(userId, attachmentId);

    if (attachment.storageKey) {
      try {
        await fs.unlink(
          path.join(this.uploadsDirFor(userId), attachment.storageKey)
        );
      } catch (error) {
        console.warn('Failed to remove upload file:', error);
      }
    }

    await prisma.attachment.delete({ where: { id: attachment.id } });
    return { success: true };
  }

  /**
   * Return the publicly served URL for an attachment
   */
  async getPublicUrl(attachment: Attachment): Promise<string> {
    return attachment.fileUrl;
  }

  /**
   * Signed URLs apply to cloud storage; local uploads return the public URL
   */
  async getSignedUrl(
    attachment: Attachment
  ): Promise<{ url: string; expiresIn: number }> {
    return { url: attachment.fileUrl, expiresIn: 3600 };
  }
}

export const uploadService = new UploadService();