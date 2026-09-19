/**
 * Image helpers. The canvas/DOM functions are client-only and return null
 * (or guard) when `document` is unavailable.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: string;
}

/**
 * Read the natural dimensions of an image file.
 * @example await imageDimensionsFromFile(file) // { width: 800, height: 600 }
 */
export function imageDimensionsFromFile(file: Blob): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Create a square-ish thumbnail (keeps aspect ratio) via canvas.
 * Returns null outside the browser or when encoding fails.
 * @example const thumb = await createImageThumbnail(file, { maxWidth: 128 })
 */
export async function createImageThumbnail(
  file: Blob,
  options: ResizeOptions & { format?: 'image/jpeg' | 'image/webp' | 'image/png' } = {}
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const { maxWidth = 256, maxHeight = 256, quality = 0.8, format = 'image/jpeg' } = options;
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const { width, height } = computeScaledSize(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, width, height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode thumbnail'))),
          format,
          quality
        );
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/**
 * Check whether a string is a `data:` URL.
 * @example isDataUrl('data:image/png;base64,iVBOR...') // true
 */
export function isDataUrl(value: string): boolean {
  return /^data:[^,]+(?:;base64)?,/i.test(value);
}

/**
 * Convert a `data:` URL into a Blob. Returns null for invalid input.
 * @example const blob = dataUrlToBlob('data:image/png;base64,...')
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] ?? 'application/octet-stream';
  const payload = match[3] ?? '';
  const bytes = match[2]
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mime });
}

/**
 * Resize an image (data URL or Blob) and return a data URL. Client-only.
 * @example const resized = await resizeImage(dataUrl, { maxWidth: 256 })
 */
export async function resizeImage(
  source: string | Blob,
  options: ResizeOptions = {}
): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const { maxWidth = 1024, maxHeight = 1024, quality = 0.85, format = 'image/jpeg' } = options;
  try {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    try {
      const img = await loadImage(url);
      const { width, height } = computeScaledSize(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL(format, quality);
    } finally {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

function computeScaledSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number
): ImageDimensions {
  const scale = Math.min(
    1,
    maxWidth / Math.max(1, naturalWidth),
    maxHeight / Math.max(1, naturalHeight)
  );
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}