/**
 * Attachment validation helpers.
 *
 * Pure functions for size/type checks, filename sanitization, and mime-type
 * classification. `Attachment.type` does not exist as a column in the Prisma
 * schema (the model stores `mimeType`), so `getAttachmentType` derives a
 * display/storage category from the mime type.
 */

/** Maximum accepted upload size in bytes (10 MB). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Attachment category. Mirrors the conceptual `Attachment.type` values used
 * across the app; derived from mime type at runtime.
 */
export type AttachmentType = 'image' | 'document' | 'audio' | 'video' | 'other';

/** Allowed mime types grouped by attachment category. */
export const ALLOWED_MIME_TYPES: Record<AttachmentType, readonly string[]> = {
  image: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/avif',
    'image/bmp',
    'image/x-icon',
  ],
  document: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  audio: [
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/flac',
  ],
  video: [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
  ],
  other: ['application/zip', 'application/gzip', 'application/octet-stream'],
};

/** Mime-type families accepted by wildcard prefix matching. */
const PREFIX_ALLOWED: readonly string[] = ['image/', 'audio/', 'video/'];

/** Returns every known mime type across all categories. */
export function supportedMimeTypes(): string[] {
  return Object.values(ALLOWED_MIME_TYPES).flat();
}

/**
 * Whether a mime type is in the allow-list (exact match or family prefix).
 */
export function isAllowedType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return false;

  for (const type of Object.values(ALLOWED_MIME_TYPES)) {
    if (type.includes(normalized)) return true;
  }
  return PREFIX_ALLOWED.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Classify a mime type into an attachment category (`other` as fallback).
 *
 * @example
 * getAttachmentType('image/png') // => 'image'
 * getAttachmentType('application/pdf') // => 'document'
 * getAttachmentType('text/plain') // => 'document'
 */
export function getAttachmentType(mimeType: string): AttachmentType {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return 'other';

  for (const type of Object.keys(ALLOWED_MIME_TYPES) as AttachmentType[]) {
    if (ALLOWED_MIME_TYPES[type].includes(normalized)) return type;
  }
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized.startsWith('video/')) return 'video';
  return 'other';
}

/** File metadata candidate for validation. */
export interface FileValidationInput {
  name: string;
  type: string;
  size: number;
}

export type FileValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Comprehensive file validation: name presence, size limit and mime allow-list.
 *
 * @example
 * validateFile({ name: 'notes.txt', type: 'text/plain', size: 2048 });
 * // => { ok: true }
 */
export function validateFile(input: FileValidationInput): FileValidationResult {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'A file name is required.' };
  }

  if (!Number.isFinite(input.size) || input.size < 0) {
    return { ok: false, error: 'File size must be a non-negative number.' };
  }

  if (input.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB size limit.`,
    };
  }

  if (input.type && !isAllowedType(input.type)) {
    return {
      ok: false,
      error: `File type "${input.type}" is not allowed.`,
    };
  }

  return { ok: true };
}

/**
 * Sanitize a file name for safe storage: strips path segments, controls and
 * unsafe characters, and caps total length while preserving the extension.
 *
 * @example
 * sanitizeFilename('../../etc/passwd') // => 'passwd'
 * sanitizeFilename('my scan.pdf') // => 'my-scan.pdf'
 */
export function sanitizeFilename(name: string): string {
  let cleaned = name.replace(/\\/g, '/').split('/').pop() ?? '';

  cleaned = cleaned
    .replace(/[^\w.\- ]/g, '')
    .replace(/^[.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');

  cleaned = cleaned.replace(/-+/g, '-').replace(/^-|-$/g, '');

  const maxBaseLength = 120;
  if (cleaned.length > maxBaseLength) {
    const extension = cleaned.lastIndexOf('.');
    if (extension > 0) {
      const base = cleaned.slice(0, extension);
      const ext = cleaned.slice(extension);
      cleaned = `${base.slice(0, maxBaseLength - ext.length)}${ext}`;
    } else {
      cleaned = cleaned.slice(0, maxBaseLength);
    }
  }

  return cleaned || 'file';
}