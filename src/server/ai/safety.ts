export function sanitizeInsightText(text: string): string {
  let sanitized = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  return sanitized.trim();
}

export function isInsightSafe(insight: { title: string; summary: string }): boolean {
  const unsafeKeywords = ['suicide', 'kill', 'murder', 'harm'];
  const text = `${insight.title} ${insight.summary}`.toLowerCase();
  for (const keyword of unsafeKeywords) {
    if (text.includes(keyword)) return false;
  }
  return true;
}

export function validateInsightContent(insights: any[]): boolean {
  if (!Array.isArray(insights)) return false;
  for (const insight of insights) {
    if (!insight.title || !insight.summary) return false;
    if (!isInsightSafe(insight)) return false;
  }
  return true;
}
