export function sanitizeHtml(input: string): string {
  return input.replace(/<[^>]*>?/gm, '');
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
}

export function sanitizeSearchQuery(query: string): string {
  return query.replace(/[%_]/g, '\\$&');
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}
