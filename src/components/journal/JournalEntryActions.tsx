'use client';

/**
 * JournalEntryActions — per-entry commands: open, favorite, archive, history,
 * delete.
 *
 * Favorite and archive act on the stored `isFavorite` / `isArchived` columns,
 * which the schema and the PATCH route already supported and no UI reached.
 * They are optimistic: the label changes immediately and reverts with a message
 * if the request fails, because these are toggles people use in a rhythm and a
 * half-second round trip each would make the list feel broken.
 *
 * Delete stays behind a confirmation owned by the page, not by this component,
 * because soft delete and permanent delete must never be one mis-click apart.
 */
import * as React from 'react';
import { Archive, ArchiveRestore, Heart, History, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface JournalEntryActionsProps {
  entryId: string;
  date: string;
  isFavorite: boolean;
  isArchived: boolean;
  onEdit?: (id: string) => void;
  onOpenHistory?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Called after a successful toggle, so the list can refresh its totals. */
  onChanged?: (id: string, change: { isFavorite?: boolean; isArchived?: boolean }) => void;
  className?: string;
}

type Field = 'isFavorite' | 'isArchived';

export default function JournalEntryActions({
  entryId,
  date,
  isFavorite,
  isArchived,
  onEdit,
  onOpenHistory,
  onDelete,
  onChanged,
  className,
}: JournalEntryActionsProps) {
  /**
   * Optimistic overrides.
   *
   * Keyed by field rather than read from props so the label is correct on the
   * frame the user clicks, without waiting for the parent to refetch — and so a
   * failed toggle can be rolled back to the value the server still holds.
   */
  const [optimistic, setOptimistic] = React.useState<Partial<Record<Field, boolean>>>({});
  const [busy, setBusy] = React.useState<Field | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const favorite = optimistic.isFavorite ?? isFavorite;
  const archived = optimistic.isArchived ?? isArchived;

  // Dismiss the overflow menu on outside click or Escape. A menu that only
  // closes on re-click is easy to leave open over the entry underneath.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const toggle = async (field: Field) => {
    if (busy !== null) return;
    const previous = optimistic[field];
    const next = !(field === 'isFavorite' ? favorite : archived);

    setError(null);
    setOptimistic((current) => ({ ...current, [field]: next }));
    setBusy(field);

    try {
      await apiRequest(`/api/journal/${entryId}`, { method: 'PATCH', body: { [field]: next } });
      onChanged?.(entryId, { [field]: next });
    } catch (err) {
      // Roll back to what the server has, not to what was clicked.
      setOptimistic((current) => ({ ...current, [field]: previous ?? !next }));
      setError(
        err instanceof Error
          ? err.message
          : field === 'isFavorite'
            ? 'Could not update favorite'
            : 'Could not update archive'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    // `relative` because the overflow menu below is absolutely positioned:
    // without it the menu anchors to the nearest positioned ancestor — the page
    // container — and renders far from the button that opened it.
    <div
      ref={containerRef}
      className={cn('relative flex flex-wrap items-center gap-1', className)}
    >
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={favorite}
        aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
        disabled={busy !== null}
        onClick={() => void toggle('isFavorite')}
        className={cn(favorite && 'text-red-600 dark:text-red-400')}
      >
        <Heart className={cn('h-3.5 w-3.5', favorite && 'fill-current')} />
        <span className="sr-only sm:not-sr-only sm:ml-1.5">
          {favorite ? 'Favorited' : 'Favorite'}
        </span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        aria-pressed={archived}
        aria-label={archived ? 'Unarchive entry' : 'Archive entry'}
        disabled={busy !== null}
        onClick={() => void toggle('isArchived')}
      >
        {archived ? (
          <ArchiveRestore className="h-3.5 w-3.5" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
        <span className="sr-only sm:not-sr-only sm:ml-1.5">
          {archived ? 'Unarchive' : 'Archive'}
        </span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        aria-label={`More actions for the entry from ${date}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Entry actions"
          className="absolute left-0 top-full z-20 mt-1 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {onEdit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onEdit(entryId);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          {onOpenHistory && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpenHistory(entryId);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <History className="h-3.5 w-3.5" />
              Version history
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onDelete(entryId);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Move to trash
            </button>
          )}
        </div>
      )}

      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
