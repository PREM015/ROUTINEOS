"use client";
/**
 * TreeMap — nested rectangles laid out from flat hierarchical data.
 *
 * Items are sorted by value (desc) and laid out with an alternating slice-and-dice
 * split that divides the total value into balanced halves. Rectangles are rendered
 * as absolutely positioned cells with a color per item.
 *
 * Props:
 * - data: flat rows with a label key and a numeric value key
 * - nameKey: property holding the label (default "name")
 * - valueKey: property holding the value (default "value")
 * - height: chart pixel height (default 320)
 * - colors: cell color palette (cycled per item)
 * - showValues: overlay the raw value beneath the label
 */

import { cn } from '@/lib/utils';

export interface TreeMapProps {
  data: Array<Record<string, unknown>>;
  nameKey?: string;
  valueKey?: string;
  height?: number;
  className?: string;
  colors?: string[];
  showValues?: boolean;
  ariaLabel?: string;
}

const DEFAULT_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#ec4899',
  '#6366f1',
];

/** Resolve the color at `index`, cycling through `colors` or the default palette. */
function resolveColor(index: number, colors?: string[]): string {
  return (
    colors?.[index % colors.length] ??
    DEFAULT_COLORS[index % DEFAULT_COLORS.length] ??
    DEFAULT_COLORS[0] ??
    '#3b82f6'
  );
}

interface TreemapItem {
  label: string;
  value: number;
}

interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlacedItem extends CellRect {
  label: string;
  value: number;
}

function sumValues(items: TreemapItem[]): number {
  return items.reduce((acc, item) => acc + item.value, 0);
}

/** Recursively split items by total value into alternating orientations. */
function placeCells(items: TreemapItem[], rect: CellRect, vertical: boolean, out: PlacedItem[]): void {
  if (items.length === 0) {
    return;
  }
  if (items.length === 1) {
    const item = items[0] as TreemapItem;
    out.push({ label: item.label, value: item.value, ...rect });
    return;
  }

  const total = sumValues(items) || items.length;
  let running = 0;
  let bestDiff = Infinity;
  let splitIndex = 1;

  for (let i = 0; i < items.length - 1; i += 1) {
    running += items[i]?.value ?? 0;
    const diff = Math.abs(total - 2 * running);
    if (diff < bestDiff) {
      bestDiff = diff;
      splitIndex = i + 1;
    }
  }

  const left = items.slice(0, splitIndex);
  const right = items.slice(splitIndex);
  const leftTotal = sumValues(left) || left.length;
  const rightTotal = sumValues(right) || right.length;
  const fraction = leftTotal / (leftTotal + rightTotal);

  if (vertical) {
    placeCells(left, { ...rect, width: rect.width * fraction }, !vertical, out);
    placeCells(right, { ...rect, x: rect.x + rect.width * fraction, width: rect.width * (1 - fraction) }, !vertical, out);
  } else {
    placeCells(left, { ...rect, height: rect.height * fraction }, !vertical, out);
    placeCells(right, { ...rect, y: rect.y + rect.height * fraction, height: rect.height * (1 - fraction) }, !vertical, out);
  }
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

export function TreeMap({
  data,
  nameKey = 'name',
  valueKey = 'value',
  height = 320,
  className,
  colors,
  showValues = true,
  ariaLabel = 'Tree map',
}: TreeMapProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex h-40 items-center justify-center text-sm text-gray-500"
        role="img"
        aria-label={`${ariaLabel} — no data`}
      >
        No data to display
      </div>
    );
  }

  const items: TreemapItem[] = data.map((row, index) => {
    const raw = Number(row[valueKey]);
    const value = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    const fallback = row[nameKey] ?? `Item ${index + 1}`;
    return { label: String(fallback), value };
  });

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const placed: PlacedItem[] = [];
  placeCells(
    sorted.map((item) => ({ ...item, value: item.value || 1 })),
    { x: 0, y: 0, width: 1, height: 1 },
    true,
    placed,
  );

  return (
    <div
      className={cn('relative w-full', className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      {placed.map((cell, index) => (
        <div
          key={`${cell.label}-${index}`}
          className="absolute overflow-hidden rounded-sm text-white"
          style={{
            left: toPercent(cell.x),
            top: toPercent(cell.y),
            width: toPercent(cell.width),
            height: toPercent(cell.height),
            backgroundColor: resolveColor(index, colors),
          }}
          title={`${cell.label}: ${cell.value}`}
        >
          <span className="block truncate px-1 text-[10px] font-medium leading-tight">
            {cell.label}
          </span>
          {showValues && <span className="block truncate px-1 text-[9px] text-white/70">{cell.value}</span>}
        </div>
      ))}
    </div>
  );
}

export default TreeMap;