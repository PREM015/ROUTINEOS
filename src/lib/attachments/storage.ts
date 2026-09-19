/**
 * Attachment file-system storage.
 *
 * Stores buffers under `public/uploads` (relative to the project root) using
 * `fs/promises`. Every public path helper guards against path traversal:
 * relative paths containing `..` or absolute paths that escape the uploads root
 * are rejected.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Root directory (project-relative) where attachments are stored. */
export const UPLOADS_DIR = 'public/uploads';

/** Maximum file name length used by storage helpers. */
export const MAX_FILENAME_LENGTH = 150;

export interface StoreOptions {
  /** File name to store under. */
  filename: string;
  /** Optional sub-directory below the uploads root (forward slashes ok). */
  directory?: string;
}

/**
 * Resolve `relPath` to an absolute path inside the uploads root, rejecting
 * paths that escape it.
 */
function resolveInsideRoot(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.split('/').includes('..')) {
    throw new Error('Path traversal is not allowed.');
  }

  const root = path.resolve(process.cwd(), UPLOADS_DIR);
  const resolved = path.resolve(root, normalized);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Path escapes the uploads root.');
  }
  return resolved;
}

/** Normalize a directory segment list, rejecting traversal attempts. */
function normalizeDirectory(directory: string): string {
  const cleaned = directory
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.');

  if (cleaned.includes('..')) {
    throw new Error('Directory must not contain "..".');
  }
  return cleaned.join('/');
}

/**
 * Store a buffer on disk under the uploads root.
 *
 * Returns the stored relative path (forward slashes) so it can be persisted in
 * the `Attachment.fileUrl`/`storageKey` columns.
 */
export async function store(
  buffer: Buffer,
  options: StoreOptions
): Promise<string> {
  const directory = normalizeDirectory(options.directory ?? '');
  const root = path.resolve(process.cwd(), UPLOADS_DIR);
  const targetDirectory = directory
    ? path.resolve(root, directory)
    : root;

  await fs.mkdir(targetDirectory, { recursive: true });

  const filePath = path.join(targetDirectory, options.filename);
  if (
    filePath !== root &&
    !filePath.startsWith(`${root}${path.sep}`)
  ) {
    throw new Error('Path escapes the uploads root.');
  }

  await fs.writeFile(filePath, buffer);
  return directory ? `${directory}/${options.filename}` : options.filename;
}

/**
 * Delete the file at the given relative path. Missing files are treated as
 * success (idempotent removal).
 */
export async function remove(relPath: string): Promise<void> {
  const filePath = resolveInsideRoot(relPath);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== 'ENOENT') throw error;
  }
}

/**
 * Read the file at the given relative path as a buffer.
 */
export async function read(relPath: string): Promise<Buffer> {
  const filePath = resolveInsideRoot(relPath);
  return fs.readFile(filePath);
}

/**
 * Build the public URL for a stored relative path (e.g. `/uploads/x/photo.png`).
 */
export async function resolvePublicUrl(relPath: string): Promise<string> {
  const filePath = await resolveInsideRoot(relPath);
  const relative = path.relative(
    path.resolve(process.cwd(), UPLOADS_DIR),
    filePath
  );
  // Ignore the return of resolveInsideRoot-via-resolvePublicUrl: guard only.
  if (relative.startsWith('..')) {
    throw new Error('Path escapes the uploads root.');
  }
  return `/uploads/${relative.replace(/\\/g, '/')}`;
}