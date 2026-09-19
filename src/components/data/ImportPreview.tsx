'use client';

/**
 * ImportPreview — tabular preview of a parsed import payload.
 *
 * Normalizes an arbitrary parsed JSON document (object with entity collections
 * or a plain array) into groups and renders each as a small table of the first
 * few rows so the user can sanity-check a backup before importing.
 *
 * Usage:
 *   <ImportPreview data={parsedJson} />
 */

import { useMemo } from 'react';
import { ClipboardList, TableProperties } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

interface PreviewGroup {
  type: string;
  items: unknown[];
}

const MAX_PREVIEW_ROWS = 8;
const MAX_COLUMNS = 4;

export interface ImportPreviewProps {
  data: unknown;
  className?: string;
}

export function ImportPreview({ data, className }: ImportPreviewProps) {
  const groups = useMemo(() => normalizeGroups(data), [data]);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<TableProperties className="h-12 w-12 text-gray-300" />}
        title="Nothing to preview"
        description="The parsed file contains no array-based collections."
      />
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {groups.map((group) => (
        <PreviewGroupTable key={group.type} group={group} />
      ))}
    </div>
  );
}

function PreviewGroupTable({ group }: { group: PreviewGroup }) {
  const columns = previewColumns(group.items);
  const rows = group.items.slice(0, MAX_PREVIEW_ROWS);

  return (
    <Card>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">{group.type}</h3>
          <Badge variant="primary" className="ml-auto">
            {group.items.length.toLocaleString()} rows
          </Badge>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 font-medium text-gray-500">#</th>
                {columns.map((column) => (
                  <th key={column} className="max-w-[12rem] truncate px-3 py-2 font-medium text-gray-500" title={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-gray-400">
                    Empty collection
                  </td>
                </tr>
              ) : (
                rows.map((item, rowIndex) => (
                  <tr key={`${group.type}-${rowIndex}`} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 tabular-nums text-gray-400">{rowIndex + 1}</td>
                    {columns.map((column) => (
                      <td
                        key={column}
                        className="max-w-[12rem] truncate px-3 py-2 text-gray-700"
                        title={cellValue(item, column)}
                      >
                        {cellValue(item, column) || '—'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {group.items.length > MAX_PREVIEW_ROWS && (
          <p className="mt-2 text-xs text-gray-400">
            Showing {MAX_PREVIEW_ROWS} of {group.items.length.toLocaleString()} rows.
          </p>
        )}
      </div>
    </Card>
  );
}

function normalizeGroups(data: unknown): PreviewGroup[] {
  if (Array.isArray(data)) {
    return data.length > 0 ? [{ type: 'entities', items: data }] : [];
  }

  if (typeof data !== 'object' || data === null) return [];

  const groups: PreviewGroup[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value.length > 0) groups.push({ type: key, items: value });
    } else if (value !== null && typeof value === 'object') {
      groups.push({ type: key, items: [value] });
    }
  }
  return groups;
}

function previewColumns(items: readonly unknown[]): string[] {
  const first = items[0];
  if (!first || typeof first !== 'object' || first === null) return ['value'];
  return Object.keys(first).slice(0, MAX_COLUMNS);
}

function previewValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const json = JSON.stringify(value);
  return json.length > 60 ? `${json.slice(0, 60)}…` : json;
}

function cellValue(item: unknown, key: string): string {
  if (typeof item !== 'object' || item === null) return previewValue(item);
  const record = item as Record<string, unknown>;
  return previewValue(record[key]);
}

export default ImportPreview;