/**
 * Tag helpers.
 * Pure utilities for tag names, colors, and deduplication.
 */

const TAG_COLOR_PALETTE = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#22c55e', // green
] as const;

export const TAG_NAME_MAX_LENGTH = 50;

/**
 * Normalize a tag name: trimmed and whitespace collapsed.
 * @example
 * normalizeTagName('  Deep   Work ') // => 'Deep Work'
 */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Whether a name is valid for a tag after normalization.
 */
export function isValidTagName(name: string): boolean {
  const normalized = normalizeTagName(name);
  return (
    normalized.length > 0 &&
    normalized.length <= TAG_NAME_MAX_LENGTH
  );
}

/**
 * Whether a value is a valid hex color like `#FF00AA`.
 */
export function isValidTagColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(color);
}

/**
 * Deterministically pick a palette color for a tag name, so the same name
 * always renders with the same color.
 */
export function colorForTagName(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  const index = Math.abs(hash) % TAG_COLOR_PALETTE.length;
  return TAG_COLOR_PALETTE[index] ?? TAG_COLOR_PALETTE[0];
}

/**
 * Remove duplicate tag names (case-insensitive), preserving first-seen order.
 */
export function dedupeTags(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const normalized = normalizeTagName(raw).toLowerCase();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalizeTagName(raw));
  }
  return out;
}

/**
 * URL/key friendly slug for a tag name.
 */
export function tagNameToSlug(name: string): string {
  return normalizeTagName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}