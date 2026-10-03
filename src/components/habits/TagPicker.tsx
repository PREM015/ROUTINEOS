'use client';

/**
 * TagPicker — pick and create `Tag` rows for a habit.
 *
 * Tags were fully built on the server and completely unreachable from the UI:
 * `Tag` / `HabitTag` exist, `HabitService.createHabit` and `updateHabit` already
 * honour `tagIds`, `habitQuerySchema` accepts `tagId`, and `findAll` includes
 * `tags: { include: { tag: true } }`. Nothing in the client ever sent or read
 * any of it, so a tag could only be attached by calling the API by hand.
 *
 * Used by both the Add and the Edit modal, because a picker that exists in only
 * one of them is a picker nobody can use to correct a mistake.
 *
 * Colours are all semantic tokens (`border-border`, `text-muted-foreground`, …).
 * A user-chosen tag colour is applied through `color-mix` on top of a token
 * base, so a pastel tag is legible in dark mode without a second hardcoded
 * palette — the failure mode that produced white-on-white chips.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Hash, Plus, X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface TagOption {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface TagPickerProps {
  /** Currently selected tag ids. */
  value: string[];
  onChange: (tagIds: string[]) => void;
  label?: string;
  className?: string;
  /** Called with the full refreshed list so the parent can render chips. */
  onTagsLoaded?: (tags: TagOption[]) => void;
}

/**
 * A chip tinted by the tag's own colour.
 *
 * `color-mix` against `var(--card)` / `var(--foreground)` means the swatch keeps
 * the user's colour in both themes instead of only in the one where that hex
 * happens to have contrast. Falls back to plain tokens when there is no colour.
 *
 * `onClick` and `onRemove` are separate on purpose: the list page uses `onClick`
 * to filter by a tag (and says so in its own aria-label), while `onRemove` is
 * only ever an actual "detach this from the thing above me" action. Reusing the
 * remove affordance for filtering would announce "Remove tag Health" for a
 * click that filters.
 */
export function TagChip({
  tag,
  onRemove,
  onClick,
  className,
  ...rest
}: {
  tag: TagOption;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<'span'>, 'onClick' | 'onRemove' | 'children'>) {
  const tint = tag.color
    ? `color-mix(in oklab, ${tag.color} 18%, var(--card))`
    : undefined;
  const text = tag.color
    ? `color-mix(in oklab, ${tag.color} 75%, var(--foreground))`
    : undefined;
  const dot = tag.color
    ? `color-mix(in oklab, ${tag.color} 85%, var(--foreground))`
    : 'var(--muted-foreground)';
  return (
    <span
      {...rest}
      onClick={onClick}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium',
        onClick && 'cursor-pointer transition hover:border-foreground/25',
        className
      )}
      style={tint ? { backgroundColor: tint, color: text } : undefined}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: dot }}
      />
      {tag.icon && (
        <span aria-hidden="true" className="shrink-0 text-[10px]">
          {tag.icon}
        </span>
      )}
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={e => {
            // Otherwise the click also bubbles to the chip's own onClick and
            // removes *and* filters at once.
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${tag.name}`}
          className="-mr-0.5 shrink-0 rounded-full p-0.5 opacity-60 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function TagPicker({ value, onChange, label = 'Tags', className, onTagsLoaded }: TagPickerProps) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const draftRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuth('/api/tags');
      if (!res.ok) throw new Error(`Could not load tags (status ${res.status})`);
      const json = await res.json();
      const list: TagOption[] = Array.isArray(json.data) ? json.data : [];
      setTags(list);
      onTagsLoaded?.(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tags');
    } finally {
      setLoading(false);
    }
  }, [onTagsLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (creating) draftRef.current?.focus();
  }, [creating]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id]);
  };

  const create = async () => {
    const name = draft.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await fetchWithAuth('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Could not create tag (status ${res.status})`);
      }
      const json = await res.json();
      const created: TagOption = json.data;
      setTags((prev) => [...prev, created]);
      onTagsLoaded?.([...tags, created]);
      onChange([...value, created.id]);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create tag');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
        <span className="text-xs text-muted-foreground">
          {value.length > 0 ? `${value.length} selected` : 'Optional'}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-wrap gap-1.5" aria-busy="true" aria-label="Loading tags">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="h-6 w-16 animate-pulse rounded-full bg-muted"
            />
          ))}
        </div>
      ) : tags.length === 0 && !error ? (
        <p className="text-xs text-muted-foreground">
          No tags yet. Create one below to group habits.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => {
            const selected = value.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                aria-pressed={selected}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:border-foreground/25 hover:text-foreground'
                )}
              >
                {selected ? <Check size={11} /> : <Hash size={11} />}
                <span className="truncate">{tag.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id={inputId}
          ref={draftRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void create();
            }
          }}
          placeholder="New tag name"
          maxLength={50}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={!draft.trim() || creating}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Plus size={14} />
          {creating ? 'Adding…' : 'Add'}
        </button>
      </div>

      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default TagPicker;
