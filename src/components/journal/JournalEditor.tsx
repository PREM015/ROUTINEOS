"use client";

/**
 * JournalEditor — create or edit a journal entry. The content area uses the
 * shared RichTextEditor; mood and energy are 1–5 pickers; tags are chosen via
 * TagInput (free-text names are resolved to existing tag ids on save).
 *
 * Create:  POST   /api/journal
 * Update:  PATCH  /api/journal/[id]
 *
 * Usage:
 *   <JournalEditor onSaved={handleSaved} availableTags={tags} />
 *   <JournalEditor entry={selected} onSaved={handleSaved} onCancel={close} />
 */
import * as React from 'react';
import type { Tag } from '@prisma/client';
import { Save } from 'lucide-react';
import type { JournalEntryWithRelations } from '@/types/journal';
import { apiRequest } from '@/lib/api-client';
import { Button, Card, Input } from '@/components/ui';
import RichTextEditor from '@/components/ui/RichTextEditor';
import TagInput from '../tags/TagInput';
import { MOOD_COLORS, MOOD_LABELS } from './JournalEntry';
import { cn } from '@/lib/utils';

export interface JournalEditorProps {
  /** When provided the editor loads this entry for editing. */
  entry?: JournalEntryWithRelations;
  /** Tags available to attach (their names are offered as suggestions). */
  availableTags?: Tag[];
  onSaved: (entry: JournalEntryWithRelations) => void;
  onCancel?: () => void;
  className?: string;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

const RATINGS: readonly number[] = [1, 2, 3, 4, 5];

export default function JournalEditor({ entry, availableTags, onSaved, onCancel, className }: JournalEditorProps) {
  const [title, setTitle] = React.useState(entry?.title ?? '');
  const [content, setContent] = React.useState(entry?.content ?? '');
  const [mood, setMood] = React.useState<number | null>(entry?.mood ?? null);
  const [energy, setEnergy] = React.useState<number | null>(entry?.energy ?? null);
  const [tagNames, setTagNames] = React.useState<string[]>(
    () => (entry?.tags ?? []).map((relation) => relation.tag.name) ?? [],
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const suggestions = React.useMemo(
    () => (availableTags ?? []).map((tag) => tag.name),
    [availableTags],
  );

  const validate = (): string | null => {
    const text = content.replace(/<[^>]*>/g, '').trim();
    if (text.length === 0) return 'Content is required';
    if (content.length > 10000) return 'Content must be 10000 characters or less';
    if (title.length > 200) return 'Title must be 200 characters or less';
    return null;
  };

  const save = async () => {
    if (saving) return;
    const errorMessage = validate();
    if (errorMessage) {
      setError(errorMessage);
      return;
    }

    const tagIds = tagNames
      .map((name) => (availableTags ?? []).find((tag) => tag.name === name)?.id)
      .filter((id): id is string => id !== undefined);

    const payload: Record<string, unknown> = {
      date: entry?.date ?? todayString(),
      title: title.trim().length > 0 ? title.trim() : undefined,
      content,
      ...(mood !== null ? { mood } : {}),
      ...(energy !== null ? { energy } : {}),
      ...(tagIds.length > 0 ? { tagIds } : { tagIds: [] }),
    };

    setSaving(true);
    setError(null);
    try {
      const result = await apiRequest<JournalEntryWithRelations>(
        entry ? `/api/journal/${entry.id}` : '/api/journal',
        { method: entry ? 'PATCH' : 'POST', body: payload },
      );
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save journal entry');
    } finally {
      setSaving(false);
    }
  };

  const picker = (
    label: string,
    value: number | null,
    onChange: (value: number | null) => void,
  ) => (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {RATINGS.map((rating) => {
          const selected = value === rating;
          const color = MOOD_COLORS[rating] ?? '#6b7280';
          return (
            <button
              key={rating}
              type="button"
              onClick={() => onChange(selected ? null : rating)}
              title={MOOD_LABELS[rating] ?? `${rating}/5`}
              aria-pressed={selected}
              className={cn(
                'inline-flex h-9 min-w-10 items-center justify-center rounded-md border px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                selected
                  ? 'border-transparent text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
              )}
              style={selected ? { backgroundColor: color } : undefined}
            >
              {rating}
            </button>
          );
        })}
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex h-9 items-center rounded-md border border-gray-300 px-2.5 text-xs text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Card className={cn('p-5', className)}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {entry ? 'Edit journal entry' : 'New journal entry'}
      </h2>

      <div className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Entry title (optional)"
          maxLength={200}
        />

        <div>
          <span className="mb-1.5 block text-sm font-medium text-gray-700">Content</span>
          <RichTextEditor value={content} onChange={setContent} placeholder="Write your entry…" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {picker('Mood', mood, setMood)}
          {picker('Energy', energy, setEnergy)}
        </div>

        <TagInput
          label="Tags"
          value={tagNames}
          onChange={setTagNames}
          suggestions={suggestions}
          placeholder="Type and press Enter to add a tag…"
        />

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={() => void save()} isLoading={saving}>
            {!saving && <Save className="mr-1.5 h-4 w-4" />}
            {entry ? 'Save changes' : 'Create entry'}
          </Button>
        </div>
      </div>
    </Card>
  );
}