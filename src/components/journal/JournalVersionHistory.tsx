"use client";

/**
 * JournalVersionHistory — lists the saved revisions of a journal entry
 * (newest first) with a Restore button per revision. Restoring snapshots the
 * current content first on the server, so history is never lost.
 *
 * Usage:
 *   <JournalVersionHistory entryId={entry.id} onRestored={reload} />
 */
import * as React from 'react';
import type { JournalRevision } from '@prisma/client';
import { History, RotateCcw } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { JournalEntryWithRelations } from '@/types/journal';
import { Button, Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface JournalVersionHistoryProps {
  entryId: string;
  onRestored?: (entry: JournalEntryWithRelations) => void;
  className?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function JournalVersionHistory({
  entryId,
  onRestored,
  className,
}: JournalVersionHistoryProps) {
  const [revisions, setRevisions] = React.useState<JournalRevision[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest<JournalRevision[]>(
        `/api/journal/${entryId}/revisions`,
      );
      setRevisions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version history');
    }
  }, [entryId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const restore = async (revisionId: string) => {
    if (restoringId !== null) return;
    setRestoringId(revisionId);
    setError(null);
    try {
      const entry = await apiRequest<JournalEntryWithRelations>(
        `/api/journal/${entryId}/revisions/${revisionId}/restore`,
        { method: 'POST' },
      );
      await load();
      onRestored?.(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore revision');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Card className={cn('p-5', className)}>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
        <History className="h-4 w-4 text-gray-500" />
        Version history
      </h3>
      <p className="mb-4 text-sm text-gray-500">
        Every edit keeps the previous version. Restoring saves the current
        content as a new version first.
      </p>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {revisions === null ? (
        <div className="flex justify-center py-6">
          <Spinner className="h-5 w-5" />
        </div>
      ) : revisions.length === 0 ? (
        <p className="py-2 text-sm text-gray-500">
          No previous versions yet — they appear here after the first edit.
        </p>
      ) : (
        <ul className="space-y-3">
          {revisions.map((revision) => {
            const preview = stripHtml(revision.content).slice(0, 140);
            const isRestoring = restoringId === revision.id;
            return (
              <li
                key={revision.id}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {revision.title && revision.title.length > 0
                      ? revision.title
                      : 'Untitled version'}{' '}
                    <span className="font-normal text-gray-500">
                      · {formatTimestamp(revision.createdAt)}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">
                    {preview.length > 0 ? preview : 'No content…'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  isLoading={isRestoring}
                  onClick={() => void restore(revision.id)}
                >
                  {!isRestoring && <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                  Restore
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
