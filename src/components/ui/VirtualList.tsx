"use client";

/**
 * VirtualList — dependency-free windowed list. Only the visible slice of
 * `items` (plus `overscan`) is rendered, based on the scroll container's
 * `scrollTop`, so long lists remain cheap. Each row is given `itemHeight`.
 *
 * Usage:
 *   <VirtualList items={rows} height={480} itemHeight={48}
 *     renderItem={(row, index) => <Row data={row} index={index} />} />
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Visible viewport height in px. */
  height: number;
  /** Fixed height of a single row in px. */
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Extra rows rendered above and below the visible window. */
  overscan?: number;
  /** Stable key for a row; defaults to the item index. */
  getKey?: (item: T, index: number) => string | number;
  className?: string;
  /** Content shown when `items` is empty. */
  emptyContent?: React.ReactNode;
}

export function VirtualList<T>({
  items,
  height,
  itemHeight,
  renderItem,
  overscan = 5,
  getKey,
  className,
  emptyContent,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = React.useState(0);

  React.useEffect(() => {
    setScrollTop(0);
  }, [items]);

  const clampedOverscan = Math.max(0, overscan);
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - clampedOverscan);
  const visibleCount = Math.ceil(height / itemHeight) + clampedOverscan * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleRows: { item: T; index: number }[] = [];
  for (let i = startIndex; i < endIndex; i += 1) {
    const item = items[i];
    if (item !== undefined) visibleRows.push({ item, index: i });
  }

  if (items.length === 0) {
    return (
      <div style={{ height }} className={cn('flex items-center justify-center', className)}>
        {emptyContent ?? <p className="text-sm text-gray-500">Nothing to show</p>}
      </div>
    );
  }

  return (
    <div
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ height, overflowY: 'auto', overflowX: 'hidden' }}
      className={cn('overscroll-contain', className)}
      data-testid="virtual-list"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${startIndex * itemHeight}px)` }}>
          {visibleRows.map(({ item, index }) => (
            <div key={getKey ? getKey(item, index) : index} style={{ height: itemHeight }}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}