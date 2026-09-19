/**
 * File helpers for reading, formatting and downloading files.
 */

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'bmp',
  'svg',
  'ico',
]);

/**
 * Read a Blob/File as a UTF-8 text string.
 * @example await readFileAsText(file) // file contents
 */
export function readFileAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result : String(result ?? ''));
    };
    reader.onerror = () => reject(new Error('Failed to read file as text'));
    reader.readAsText(file);
  });
}

/**
 * Read a Blob/File as a base64 data URL.
 * @example const url = await readFileAsDataUrl(file)
 */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result : String(result ?? ''));
    };
    reader.onerror = () => reject(new Error('Failed to read file as data URL'));
    reader.readAsDataURL(file);
  });
}

/**
 * Format a byte count into a human-readable string.
 * @example formatBytes(3214) // '3.14 KB'
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Extract the lowercase extension (without the dot) from a filename.
 * @example getFileExtension('photo.JPG') // 'jpg'
 */
export function getFileExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  if (index === -1 || index === filename.length - 1) return '';
  return filename.slice(index + 1).toLowerCase();
}

/**
 * Check whether a file is an image by MIME type or extension.
 * @example isImageFile(new File([blob], 'a.png', { type: 'image/png' })) // true
 */
export function isImageFile(file: Pick<Blob, 'type'> & { name?: string }): boolean {
  if (file.type.startsWith('image/')) return true;
  if (file.name) return IMAGE_EXTENSIONS.has(getFileExtension(file.name));
  return false;
}

/**
 * Create an object URL for a Blob/File. Revoke with `revokeObjectURL` when done.
 * @example const url = fileToObjectURL(file)
 */
export function fileToObjectURL(file: Blob): string {
  return URL.createObjectURL(file);
}

/**
 * Release an object URL previously created by `fileToObjectURL`.
 */
export function revokeObjectURL(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download of the given Blob under `filename`.
 * No-op outside the browser.
 * @example downloadBlob('report.csv', csvBlob)
 */
export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}