import { describe, expect, it } from 'vitest';
import { chooseQuoteForDisplay, getVisibleQuotes } from '../src/lib/quotes';

describe('quote display helpers', () => {
  it('shows public quotes to everyone and keeps personal quotes private to their owner', () => {
    const quotes = [
      { id: 'p1', userId: 'user-1', isPublic: true, text: 'Shared wisdom', author: 'Ava' },
      { id: 'p2', userId: 'user-2', isPublic: false, text: 'Private note', author: 'Ben' },
      { id: 'p3', userId: 'user-3', isPublic: true, text: 'More wisdom', author: 'Cara' },
    ];

    expect(getVisibleQuotes(quotes, 'user-2')).toEqual([
      { id: 'p1', userId: 'user-1', isPublic: true, text: 'Shared wisdom', author: 'Ava' },
      { id: 'p2', userId: 'user-2', isPublic: false, text: 'Private note', author: 'Ben' },
      { id: 'p3', userId: 'user-3', isPublic: true, text: 'More wisdom', author: 'Cara' },
    ]);

    expect(getVisibleQuotes(quotes, 'user-4')).toEqual([
      { id: 'p1', userId: 'user-1', isPublic: true, text: 'Shared wisdom', author: 'Ava' },
      { id: 'p3', userId: 'user-3', isPublic: true, text: 'More wisdom', author: 'Cara' },
    ]);
  });

  it('selects a quote from the visible set deterministically for a given index', () => {
    const quotes = [
      { id: 'q1', userId: 'user-1', isPublic: true, text: 'One', author: 'A' },
      { id: 'q2', userId: 'user-2', isPublic: false, text: 'Two', author: 'B' },
      { id: 'q3', userId: 'user-3', isPublic: true, text: 'Three', author: 'C' },
    ];

    expect(chooseQuoteForDisplay(quotes, 'user-2', 1)).toMatchObject({ id: 'q2' });
    expect(chooseQuoteForDisplay(quotes, 'user-4', 0)).toMatchObject({ id: 'q1' });
    expect(chooseQuoteForDisplay([], 'user-4', 0)).toBeNull();
  });
});
