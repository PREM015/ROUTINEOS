import type {
  JournalEntry,
  JournalEntryTag,
  Tag,
} from '@prisma/client';

/**
 * Journaling & Reflection Types
 * Complete type system for journal entries, tags, and reflection analytics
 */

// ============================================================================
// Core Journal Types
// ============================================================================

export interface JournalEntryWithRelations extends JournalEntry {
  tags: Array<{ tag: Tag }>;
  _count?: {
    tags: number;
  };
}

export interface JournalEntryListItem {
  id: string;
  date: string;
  title: string | null;
  mood: number | null;
  energy: number | null;
  isFavorite: boolean;
  isArchived: boolean;
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  contentPreview: string;
  wordCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalGratitudeItem {
  text: string;
  emoji?: string;
}

export interface JournalTagAssignment extends JournalEntryTag {
  tag: Tag;
  entry: Pick<JournalEntry, 'id' | 'date' | 'title'>;
}

// ============================================================================
// Journal Entry Creation & Update
// ============================================================================

export interface CreateJournalEntryInput {
  date: string; // YYYY-MM-DD
  title?: string;
  content: string;
  mood?: number; // 1-5
  energy?: number; // 1-5
  gratitude?: JournalGratitudeItem[];
  isFavorite?: boolean;
  tagIds?: string[];
}

export interface UpdateJournalEntryInput {
  title?: string | null;
  content?: string;
  mood?: number | null;
  energy?: number | null;
  gratitude?: JournalGratitudeItem[];
  isFavorite?: boolean;
  isArchived?: boolean;
  tagIds?: string[];
}

export interface CreateJournalEntryResponse {
  success: boolean;
  entry?: JournalEntryWithRelations;
  message?: string;
}

export interface UpdateJournalEntryResponse {
  success: boolean;
  entry?: JournalEntryWithRelations;
  message?: string;
}

// ============================================================================
// Tags
// ============================================================================

export interface AddJournalTagsInput {
  entryId: string;
  tagIds: string[];
}

export interface RemoveJournalTagInput {
  entryId: string;
  tagId: string;
}

// ============================================================================
// Favorite & Archive Actions
// ============================================================================

export interface ToggleJournalFavoriteInput {
  entryId: string;
  isFavorite: boolean;
}

export interface ToggleJournalFavoriteResponse {
  success: boolean;
  isFavorite: boolean;
  message?: string;
}

export interface ArchiveJournalEntryInput {
  entryId: string;
  isArchived: boolean;
}

export interface ArchiveJournalEntryResponse {
  success: boolean;
  isArchived: boolean;
  message?: string;
}

// ============================================================================
// Queries & Pagination
// ============================================================================

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface JournalEntryQueryParams {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  month?: string; // YYYY-MM
  tagId?: string;
  search?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  mood?: number;
  sortBy?: 'date' | 'createdAt' | 'updatedAt' | 'mood';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface JournalListResponse {
  success: boolean;
  entries: JournalEntryListItem[];
  pagination: Pagination;
}

export interface JournalSearchResult {
  entryId: string;
  date: string;
  title: string | null;
  contentSnippet: string;
  matchField: 'title' | 'content' | 'tag';
  matchCount: number;
}

// ============================================================================
// Journal Analytics
// ============================================================================

export interface JournalAnalytics {
  period: {
    startDate: string;
    endDate: string;
  };
  totals: {
    entries: number;
    words: number;
    avgWordsPerEntry: number;
    favoriteEntries: number;
    daysJournaled: number;
  };
  streak: JournalStreak;
  moodTrend: JournalMoodTrendPoint[];
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
    count: number;
  }>;
  monthlyActivity: Array<{
    month: string;
    entries: number;
    words: number;
  }>;
}

export interface JournalMoodTrendPoint {
  date: string;
  mood: number | null;
  energy: number | null;
}

export interface JournalStreak {
  current: number;
  longest: number;
  lastJournalDate: string | null;
}

export interface JournalWordStats {
  totalWords: number;
  averageWords: number;
  longestEntryId: string | null;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isJournalEntryWithRelations(entry: unknown): entry is JournalEntryWithRelations {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'id' in entry &&
    'date' in entry &&
    'content' in entry &&
    'tags' in entry
  );
}

export function isValidJournalMoodRating(value: unknown): value is number {
  return typeof value === 'number' && value >= 1 && value <= 5;
}

// ============================================================================
// Utility Types
// ============================================================================

export type JournalEntriesByMonth = Record<string, JournalEntryListItem[]>;

export type JournalGratitudeList = JournalGratitudeItem[];