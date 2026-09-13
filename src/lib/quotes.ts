export type QuoteRecord = {
  id: string;
  userId: string;
  text: string;
  author?: string | null;
  isPublic?: boolean;
};

export function getVisibleQuotes(quotes: QuoteRecord[], currentUserId?: string | null): QuoteRecord[] {
  if (!quotes.length) return [];

  return quotes.filter((quote) => {
    if (quote.isPublic) return true;
    return !!currentUserId && quote.userId === currentUserId;
  });
}

export function chooseQuoteForDisplay(
  quotes: QuoteRecord[],
  currentUserId?: string | null,
  index = 0,
): QuoteRecord | null {
  const visible = getVisibleQuotes(quotes, currentUserId);
  if (!visible.length) return null;

  const normalizedIndex = ((index % visible.length) + visible.length) % visible.length;
  return visible[normalizedIndex] ?? null;
}
