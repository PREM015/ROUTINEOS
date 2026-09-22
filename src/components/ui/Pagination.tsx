"use client";

/**
 * Pagination — tanstack-free pager with previous/next buttons, numbered
 * page links and ellipsis compression for large page counts. Fully
 * controlled via `page` / `onPageChange`.
 *
 * Usage:
 *   <Pagination page={page} pageCount={totalPages} onPageChange={setPage} />
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  /** One-based index of the current page. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Hide the numbered links, keeping only prev/next (default false). */
  compact?: boolean;
  className?: string;
}

type PageItem = number | 'ellipsis';

function getPageItems(page: number, pageCount: number): readonly PageItem[] {
  const siblings = 1;
  const items: PageItem[] = [1];
  const start = Math.max(2, page - siblings);
  const end = Math.min(pageCount - 1, page + siblings);

  if (start > 2) items.push('ellipsis');
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < pageCount - 1) items.push('ellipsis');

  if (pageCount > 1) items.push(pageCount);
  return items;
}

export function Pagination({ page, pageCount, onPageChange, compact = false, className }: PaginationProps) {
  const clampedPage = Math.min(Math.max(1, page), Math.max(1, pageCount));
  const items = React.useMemo(() => getPageItems(clampedPage, Math.max(1, pageCount)), [
    clampedPage,
    pageCount,
  ]);

  const goTo = (target: number) => {
    const next = Math.min(Math.max(1, target), Math.max(1, pageCount));
    if (next !== clampedPage) onPageChange(next);
  };

  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => goTo(clampedPage - 1)}
        disabled={clampedPage <= 1}
        aria-label="Previous page"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {!compact &&
        items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-sm text-gray-400">
              …
            </span>
          ) : (
            <button
              key={`page-${item}`}
              type="button"
              onClick={() => goTo(item)}
              aria-current={item === clampedPage ? 'page' : undefined}
              aria-label={`Page ${item}`}
              className={cn(
                'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                item === clampedPage
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {item}
            </button>
          ),
        )}

      <button
        type="button"
        onClick={() => goTo(clampedPage + 1)}
        disabled={clampedPage >= pageCount}
        aria-label="Next page"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export default Pagination;