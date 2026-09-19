/**
 * Attachment upload orchestration.
 *
 * Composes input validation and file-system storage into a single safe API.
 * All functions are server-side (Node) and take Buffers directly – there is no
 * DOM or multipart parsing here.
 */

import { getAttachmentType, sanitizeFilename, validateFile } from './validation';
import type { AttachmentType } from './validation';
import { remove, resolvePublicUrl, store } from './storage';

/** Metadata describing a single upload candidate. */
export interface UploadMeta {
  filename: string;
  mimetype: string;
  /** Declared byte size; falls back to the actual buffer length. */
  size?: number;
  /** Optional sub-directory under the uploads root. */
  directory?: string;
}

export type UploadResult =
  | {
      ok: true;
      /** Stored relative path (e.g. `goal/abc123/photo.png`). */
      path: string;
      /** Public URL (e.g. `/uploads/goal/abc123/photo.png`). */
      url: string;
      fileName: string;
      mimeType: string;
      size: number;
      type: AttachmentType;
    }
  | { ok: false; error: string };

/**
 * Validate and persist an upload.
 *
 * @example
 * const result = await saveUpload(buffer, {
 *   filename: 'photo.png',
 *   mimetype: 'image/png',
 *   directory: 'journal',
 * });
 * if (result.ok) console.log(result.url);
 */
export async function saveUpload(
  file: Buffer,
  meta: UploadMeta
): Promise<UploadResult> {
  const size = meta.size ?? Buffer.byteLength(file);
  const validation = validateFile({
    name: meta.filename,
    type: meta.mimetype,
    size,
  });
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  try {
    const fileName = sanitizeFilename(meta.filename);
    const storedPath = await store(file, {
      filename: fileName,
      directory: meta.directory,
    });
    const url = await resolvePublicUrl(storedPath);
    return {
      ok: true,
      path: storedPath,
      url,
      fileName,
      mimeType: meta.mimetype,
      size,
      type: getAttachmentType(meta.mimetype),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Upload failed.',
    };
  }
}

/**
 * Alias of `saveUpload` for code paths that think in terms of buffers.
 */
export function uploadBuffer(
  buffer: Buffer,
  meta: UploadMeta
): Promise<UploadResult> {
  return saveUpload(buffer, meta);
}

/**
 * Delete a previously stored upload by its stored relative path.
 */
export async function deleteUpload(relPath: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await remove(relPath);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Delete failed.',
    };
  }
}