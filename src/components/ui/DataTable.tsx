"use client";

/**
 * DataTable — generic, type-safe table with column rendering, client-side
 * sorting, loading skeletons and manual (tanstack-free) pagination.
 *
 * Usage:
 *   <DataTable
 *     data={habits}
 *     columns={[{ key: 'name', header: 'Name', accessor: h => h.name, sortable: true }, ...]}
 *     keyExtractor={(h) => h.id}
 *     loading={isLoading}
 *     page={page} pageSize={20} total={total} onPageChange={setPage}
 *   />
 */
import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { Pagination } from './Pagination';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  /** Unique column identifier; also the row key read when no accessor/render is given. */
  key: string;
  header: React.ReactNode;
  /** Custom cell renderer. */
  render?: (row: T) => React.ReactNode;
  /** Value extractor used for sorting. Defaults to `row[key]`. */
  accessor?: (row: T) => string | number | null | undefined;
  /** Allow clicking the header to toggle sort order. */
  sortable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  data: readonly T[];
  columns: readonly DataTableColumn<T>[];
  keyExtractor: (row: T) => string | number;
  loading?: boolean;
  /** Controlled sort state. */
  sortBy?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Pagination (controlled). `onPageChange` being provided enables pagination UI. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

function getCellValue<T>(row: T, column: DataTableColumn<T>): unknown {
  if (column.accessor) return column.accessor(row);
  return (row as Record<string, unknown>)[column.key];
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function sortValue(value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return typeof value === 'number' ? value : String(value);
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  loading = false,
  sortBy,
  onSortChange,
  page = 1,
  pageSize = 10,
  total,
  onPageChange,
  emptyTitle = 'No data',
  emptyDescription,
  className,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = React.useState<SortState | null>(null);
  const activeSort = sortBy ? sortBy : internalSort;

  const sortedData = React.useMemo(() => {
    if (!activeSort) return data;
    const column = columns.find((c) => c.key === activeSort.key);
    if (!column) return data;
    const factor = activeSort.direction === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = sortValue(getCellValue(a, column));
      const bv = sortValue(getCellValue(b, column));
      if (av === bv) return 0;
      return (av < bv ? -1 : 1) * factor;
    });
  }, [data, columns, activeSort]);

  const toggleSort = (key: string) => {
    const next: SortState =
      activeSort?.key === key && activeSort.direction === 'asc'
        ? { key, direction: 'desc' }
        : { key, direction: 'asc' };
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  };

  const skeletonRows = Math.min(pageSize, 8);
  const resolvedTotal = total ?? sortedData.length;
  const pageCount = Math.max(1, Math.ceil(resolvedTotal / pageSize));
  const showPagination = typeof onPageChange === 'function' && resolvedTotal > pageSize;

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {columns.map((column) => {
                const isSorted = activeSort?.key === column.key;
                return (
                  <th key={column.key} className={cn('px-4 py-3 font-medium text-gray-600', column.className)}>
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        aria-label={`Sort by ${column.key}`}
                        aria-sort={
                          isSorted ? (activeSort?.direction === 'asc' ? 'ascending' : 'descending') : undefined
                        }
                        className="inline-flex items-center gap-1.5 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <span>{column.header}</span>
                        {isSorted ? (
                          activeSort?.direction === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }, (_, index) => (
                <tr key={`skeleton-${index}`} className="border-b border-gray-100 last:border-0">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[8rem]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-2">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              sortedData.map((row) => (
                <tr key={keyExtractor(row)} className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50">
                  {columns.map((column, index) => (
                    <td key={`${keyExtractor(row)}-${column.key}-${index}`} className={cn('px-4 py-3 text-gray-700', column.className)}>
                      {column.render ? column.render(row) : renderValue(getCellValue(row, column))}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showPagination && (
        <div className="mt-4 flex justify-end">
          <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange as (p: number) => void} />
        </div>
      )}
    </div>
  );
}