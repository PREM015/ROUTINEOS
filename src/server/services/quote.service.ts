import { QuoteRepository } from '@/server/repositories/quote.repository';
import type { Quote } from '@/generated/prisma';
import type { UserId } from '@/types/ids';

/**
 * Quote Service
 *
 * Owns the quote visibility and ownership rules. These previously lived inline
 * in the API routes, where the "public OR own" filter and the owner-only edit
 * rule were duplicated across GET/POST/PUT/DELETE and unreachable from anywhere
 * else.
 */

/** Built-in quotes served when the user has none of their own. */
export const DEFAULT_QUOTES: Array<{ text: string; author: string; isPublic: true }> = [
  {
    text: 'The day you plant the tree is not the day you eat the fruit. Be patient, keep watering it, and trust the process.',
    author: 'Growth Mindset',
    isPublic: true,
  },
  {
    text: 'Small steps every day create a life you can be proud of.',
    author: 'Daily Progress',
    isPublic: true,
  },
  {
    text: 'You do not need to be perfect. You only need to keep showing up.',
    author: 'RoutineOS',
    isPublic: true,
  },
  {
    text: 'Consistency compounds quietly, but it changes everything.',
    author: 'Momentum',
    isPublic: true,
  },
];

/** Single-quote fallback for the random endpoint. */
export const FALLBACK_QUOTE = {
  id: 'default',
  text: 'The secret of getting ahead is getting started.',
  author: 'Mark Twain',
};

export type QuoteInput = {
  text: string;
  author?: string;
  isPublic?: boolean;
};

export class QuoteService {
  private quoteRepository: QuoteRepository;

  constructor() {
    this.quoteRepository = new QuoteRepository();
  }

  /**
   * Quotes visible to the user, falling back to the built-in set when empty.
   */
  async listQuotes(userId: UserId): Promise<Array<Quote | (typeof DEFAULT_QUOTES)[number] & { id: string; userId: string }>> {
    const quotes = await this.quoteRepository.findVisible(userId);
    if (quotes.length > 0) return quotes;

    return DEFAULT_QUOTES.map((quote, index) => ({
      id: `default-${index + 1}`,
      userId: 'system',
      ...quote,
    }));
  }

  /**
   * Create a quote and return it alongside the refreshed visible list.
   */
  async createQuote(userId: UserId, input: QuoteInput) {
    const quote = await this.quoteRepository.create({
      user: { connect: { id: userId } },
      text: input.text,
      author: input.author?.trim() ? input.author.trim() : 'Anonymous',
      isPublic: input.isPublic ?? false,
    });

    return { quote, quotes: await this.listQuotes(userId) };
  }

  /**
   * Edit a quote. Throws unless the caller owns it.
   */
  async updateQuote(userId: UserId, quoteId: string, input: QuoteInput) {
    const existing = await this.quoteRepository.findById(quoteId);
    if (!existing || existing.userId !== userId) {
      throw new Error('You can only edit your own quotes.');
    }

    const quote = await this.quoteRepository.update(quoteId, {
      text: input.text,
      author: input.author?.trim() ? input.author.trim() : 'Anonymous',
      isPublic: input.isPublic ?? existing.isPublic,
    });

    return { quote, quotes: await this.listQuotes(userId) };
  }

  /**
   * Delete a quote. Throws unless the caller owns it.
   */
  async deleteQuote(userId: UserId, quoteId: string) {
    const existing = await this.quoteRepository.findById(quoteId);
    if (!existing || existing.userId !== userId) {
      throw new Error('You can only delete your own quotes.');
    }

    await this.quoteRepository.delete(quoteId);

    return { quotes: await this.listQuotes(userId) };
  }

  /**
   * Pick a random quote from the user's pool, optionally skipping one id so a
   * widget never shows the same quote twice in a row. Private quotes belonging
   * to other users are never returned.
   */
  async getRandomQuote(
    userId: UserId,
    options: { exclude?: string; scope?: 'all' | 'mine' } = {}
  ) {
    const { exclude, scope = 'all' } = options;
    const quotes = await this.quoteRepository.findPool(userId, scope);

    const pool = exclude ? quotes.filter((q) => q.id !== exclude) : quotes;
    // If excluding emptied a non-empty pool, allow the excluded one back rather
    // than returning nothing.
    const effective = pool.length > 0 ? pool : quotes;

    if (effective.length === 0) {
      return { ...FALLBACK_QUOTE };
    }

    return effective[Math.floor(Math.random() * effective.length)] ?? FALLBACK_QUOTE;
  }
}

export const quoteService = new QuoteService();
