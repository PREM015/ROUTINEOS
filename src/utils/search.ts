/**
 * Client/local fuzzy search helpers. The server search service uses SQL/contains;
 * these functions power in-memory filtering and highlighting.
 */

export interface MatchSegment {
  text: string;
  highlighted: boolean;
}

/**
 * True when every character of `query` appears in `text` in order (subsequence match).
 * An empty query matches anything.
 * @example fuzzyMatch('aec', 'abcde') // true
 */
export function fuzzyMatch(query: string, text: string, caseSensitive = false): boolean {
  const q = query.trim();
  if (!q) return true;
  const needle = caseSensitive ? q : q.toLowerCase();
  const haystack = caseSensitive ? text : text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < haystack.length && qi < needle.length; ti++) {
    if (haystack[ti] === needle[qi]) qi++;
  }
  return qi === needle.length;
}

/**
 * Score a fuzzy match from 0 (no match) to 100 (exact). Higher is better.
 * Rewards exact/prefix/substring matches and consecutive character runs.
 * @example scoreMatch('gro', 'grocery') // > scoreMatch('gro', 'grab over')
 */
export function scoreMatch(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  if (!fuzzyMatch(q, t)) return 0;

  let qi = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      streak++;
    } else if (streak > 1) {
      streak = 1;
    }
  }
  const score = 30 + streak;
  return Math.min(score, 59);
}

/**
 * Split `text` into segments where matched subsequence characters are flagged.
 * Useful for rendering `<mark>` highlights.
 * @example highlightMatches('gro', 'grocery')
 */
export function highlightMatches(query: string, text: string): MatchSegment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, highlighted: false }];
  const haystack = text.toLowerCase();
  const segments: MatchSegment[] = [];
  let pending = '';
  let pendingHighlighted = false;
  let qi = 0;

  const push = (char: string, highlighted: boolean): void => {
    if (pendingHighlighted === highlighted) {
      pending += char;
    } else {
      if (pending) segments.push({ text: pending, highlighted: pendingHighlighted });
      pending = char;
      pendingHighlighted = highlighted;
    }
  };

  for (let ti = 0; ti < haystack.length; ti++) {
    const matches = qi < q.length && haystack[ti] === q[qi];
    push(text[ti] ?? '', matches);
    if (matches) qi++;
  }
  if (pending) segments.push({ text: pending, highlighted: pendingHighlighted });
  return segments;
}

/**
 * Filter objects by fuzzy-searching the given keys, ranked best-match first.
 * An empty query returns the items unchanged.
 * @example simpleSearch(items, 'gro', ['title', 'notes'])
 */
export function simpleSearch<T extends object>(
  items: readonly T[],
  query: string,
  keys: Array<keyof T>
): T[] {
  if (!query.trim()) return items.slice();
  return items
    .map((item) => {
      const haystack = keys.map((key) => String(item[key] ?? '')).join(' ');
      return { item, score: scoreMatch(query, haystack) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

/**
 * True when every whitespace-separated term in `query` fuzzy-matches `text`.
 * @example matchesAllTerms('gro list', 'Grocery list') // true
 */
export function matchesAllTerms(query: string, text: string, caseSensitive = false): boolean {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((term) => fuzzyMatch(term, text, caseSensitive));
}