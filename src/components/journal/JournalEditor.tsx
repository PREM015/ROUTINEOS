'use client';

/**
 * JournalEditor — create or edit a journal entry.
 *
 * Layout is deliberately writing-first: the writing area comes before the
 * ratings, tags and prompts. Mood, energy and tags were previously above the
 * fold next to the title, which made filling in a 1–5 feel like the first task
 * of opening an entry rather than something you do afterwards.
 *
 * Create:  POST   /api/journal
 * Update:  PATCH  /api/journal/[id]  (the server snapshots a revision first)
 *
 * Create mode takes a `date`, so a past day can be journalled. If that day is
 * already taken the server answers 409 and the editor switches to editing the
 * existing entry instead of creating a duplicate — one entry per user per date
 * is a schema constraint, not a UI preference.
 *
 * Clearing a rating sends `null`, not an absent key. The old payload builder
 * omitted the key (`...(mood !== null ? { mood } : {})`), so a cleared rating
 * was indistinguishable from "unchanged" and the old value stayed on the server.
 *
 * Usage:
 *   <JournalEditor onSaved={handleSaved} availableTags={tags} />
 *   <JournalEditor entry={selected} onSaved={handleSaved} onCancel={close} />
 */
import * as React from 'react';
import type { Tag } from '@/generated/prisma';
import { Save, Sparkles } from 'lucide-react';
import type { JournalEntryWithRelations } from '@/types/journal';
import { apiRequest, ApiError } from '@/lib/api-client';
import { notifyJournalDataChanged } from '@/lib/app-events';
import { Button, Card, Input } from '@/components/ui';
import RichTextEditor from '@/components/ui/RichTextEditor';
import TagInput from '../tags/TagInput';
import {
  ENERGY_LABELS,
  JOURNAL_RATINGS,
  MOOD_LABELS,
} from '@/constants/journal';
import { richTextToPlainText } from '@/lib/security/html-sanitizer';
import { cn } from '@/lib/utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';

export interface JournalEditorProps {
  /** When provided the editor loads this entry for editing. */
  entry?: JournalEntryWithRelations;
  /**
   * Day a new entry is filed under, `YYYY-MM-DD`.
   *
   * Defaults to the user's today. Passed from the calendar so a past day can be
   * journalled without changing the system date or filing under today.
   */
  date?: string;
  /** Tags available to attach (their names are offered as suggestions). */
  availableTags?: Tag[];
  onSaved: (entry: JournalEntryWithRelations) => void;
  onCancel?: () => void;
  className?: string;
}

const DRAFT_DEBOUNCE_MS = 500;

const MAX_CONTENT_LENGTH = 10000;
const MAX_TITLE_LENGTH = 200;

interface JournalDraft {
  title: string;
  content: string;
  mood: number | null;
  energy: number | null;
  tagNames: string[];
  gratitude: string[];
  updatedAt: string;
}

function readDraft(key: string): JournalDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const strings = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    return {
      title: typeof record.title === 'string' ? record.title : '',
      content: typeof record.content === 'string' ? record.content : '',
      mood: typeof record.mood === 'number' ? record.mood : null,
      energy: typeof record.energy === 'number' ? record.energy : null,
      tagNames: strings(record.tagNames),
      gratitude: strings(record.gratitude),
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    };
  } catch {
    return null;
  }
}

/**
 * Read the stored gratitude JSON column into a list of strings.
 *
 * Both shapes the column has held are accepted: plain strings, which is what
 * this editor writes, and `{ text }` objects, which `/today`'s reflection writes
 * into the same convention.
 */
function readGratitude(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Both shapes the column has held: plain strings, and `{ text }` objects
    // written by the `/today` reflection which shares the convention.
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          const text = (item as { text?: unknown }).text;
          return typeof text === 'string' ? text : null;
        }
        return null;
      })
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export default function JournalEditor({
  entry,
  date,
  availableTags,
  onSaved,
  onCancel,
  className,
}: JournalEditorProps) {
  const isEditMode = entry !== undefined;
  // The user's today. A new entry with no explicit `date` is saved against
  // this, so it must not be the UTC date — otherwise an entry written at 22:00
  // in `Asia/Kolkata` was filed under the previous day.
  const { today } = useUserTimezone();
  const targetDate = entry?.date ?? date ?? today;

  const draftKey = React.useMemo(
    () => (entry ? `journal-draft:entry:${entry.id}` : `journal-draft:date:${targetDate}`),
    [entry, targetDate]
  );

  const baseline = React.useMemo(
    () => ({
      title: entry?.title ?? '',
      content: entry?.content ?? '',
      mood: entry?.mood ?? null,
      energy: entry?.energy ?? null,
      tagNames: (entry?.tags ?? []).map((relation) => relation.tag.name),
      gratitude: readGratitude(entry?.gratitude ?? null),
    }),
    [entry]
  );

  const [title, setTitle] = React.useState(baseline.title);
  const [content, setContent] = React.useState(baseline.content);
  const [mood, setMood] = React.useState<number | null>(baseline.mood);
  const [energy, setEnergy] = React.useState<number | null>(baseline.energy);
  const [tagNames, setTagNames] = React.useState<string[]>(baseline.tagNames);
  const [gratitude, setGratitude] = React.useState<string[]>(baseline.gratitude);
  const [showGratitude, setShowGratitude] = React.useState(baseline.gratitude.length > 0);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedMessage, setSavedMessage] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);
  const [occupied, setOccupied] = React.useState<JournalEntryWithRelations | null>(null);
  const draftAppliedForKey = React.useRef<string | null>(null);

  // Restore an autosaved draft once per draft key (new content wins over the
  // pristine baseline, never over user edits made after restore).
  React.useEffect(() => {
    if (draftAppliedForKey.current === draftKey) return;
    draftAppliedForKey.current = draftKey;
    const draft = readDraft(draftKey);
    if (!draft) return;
    const matchesBaseline =
      draft.title === baseline.title &&
      draft.content === baseline.content &&
      draft.mood === baseline.mood &&
      draft.energy === baseline.energy &&
      draft.gratitude.length === baseline.gratitude.length &&
      draft.gratitude.every((item) => baseline.gratitude.includes(item)) &&
      draft.tagNames.length === baseline.tagNames.length &&
      draft.tagNames.every((name) => baseline.tagNames.includes(name));
    if (matchesBaseline) return;
    setTitle(draft.title);
    setContent(draft.content);
    setMood(draft.mood);
    setEnergy(draft.energy);
    setTagNames(draft.tagNames);
    setGratitude(draft.gratitude);
    if (draft.gratitude.length > 0) setShowGratitude(true);
    setDraftRestored(true);
  }, [draftKey, baseline]);

  const dirty = React.useMemo(() => {
    if (savedMessage !== null) return false;
    return (
      title !== baseline.title ||
      content !== baseline.content ||
      mood !== baseline.mood ||
      energy !== baseline.energy ||
      gratitude.length !== baseline.gratitude.length ||
      gratitude.some((item) => !baseline.gratitude.includes(item)) ||
      tagNames.length !== baseline.tagNames.length ||
      tagNames.some((name) => !baseline.tagNames.includes(name))
    );
  }, [title, content, mood, energy, gratitude, tagNames, baseline, savedMessage]);

  // Autosave drafts (debounced) while there are unsaved changes; drop the
  // draft once the form matches the saved baseline again. Deliberately *not*
  // cleared on a failed save — the point of a draft is surviving exactly that.
  React.useEffect(() => {
    if (!dirty) {
      window.localStorage.removeItem(draftKey);
      return;
    }
    const timer = window.setTimeout(() => {
      const draft: JournalDraft = {
        title,
        content,
        mood,
        energy,
        tagNames,
        gratitude,
        updatedAt: new Date().toISOString(),
      };
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // Storage full or unavailable — drafts are best-effort.
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, draftKey, title, content, mood, energy, tagNames, gratitude]);

  // Warn about unsaved changes on tab close / reload.
  React.useEffect(() => {
    if (!dirty || saving) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, saving]);

  const suggestions = React.useMemo(
    () => (availableTags ?? []).map((tag) => tag.name),
    [availableTags]
  );

  const validate = (): string | null => {
    // Plain-text projection, so an entry of `<p><br></p>` is correctly rejected
    // as empty rather than passing on its markup length.
    if (richTextToPlainText(content).length === 0) return 'Content is required';
    if (content.length > MAX_CONTENT_LENGTH) {
      return `Content must be ${MAX_CONTENT_LENGTH} characters or less`;
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return `Title must be ${MAX_TITLE_LENGTH} characters or less`;
    }
    return null;
  };

  const markChanged = () => {
    setSavedMessage(null);
    setDraftRestored(false);
    setError(null);
  };

  /**
   * Resolve tag names to ids, creating any that don't exist yet.
   *
   * `TagInput` accepts free text, so the user can type a tag never used before.
   * The previous code mapped names to existing ids and filtered out the misses,
   * so a brand-new tag was silently discarded while the UI showed the chip and
   * reported "Entry created."
   */
  const resolveTagIds = async (names: string[]): Promise<string[]> => {
    const existing = availableTags ?? [];
    const tagIds: string[] = [];
    const unresolved: string[] = [];

    for (const rawName of names) {
      const name = rawName.trim();
      if (!name) continue;
      const match = existing.find((tag) => tag.name === name);
      if (match) {
        if (!tagIds.includes(match.id)) tagIds.push(match.id);
      } else if (!unresolved.some((n) => n.toLowerCase() === name.toLowerCase())) {
        unresolved.push(name);
      }
    }

    for (const name of unresolved) {
      try {
        const created = await apiRequest<{ id: string }>('/api/tags', {
          method: 'POST',
          body: { name },
        });
        if (created?.id && !tagIds.includes(created.id)) tagIds.push(created.id);
      } catch (tagErr) {
        // A 409 means it already exists — re-read and match by name rather than
        // failing the whole save.
        if (tagErr instanceof ApiError && tagErr.status === 409) {
          const refreshed = await apiRequest<Array<{ id: string; name: string }>>('/api/tags');
          const match = refreshed.find((tag) => tag.name === name);
          if (match && !tagIds.includes(match.id)) tagIds.push(match.id);
        } else {
          throw new Error(
            tagErr instanceof ApiError
              ? `Could not create tag "${name}": ${tagErr.message}`
              : `Could not create tag "${name}"`
          );
        }
      }
    }

    return tagIds;
  };

  const buildPayload = async (): Promise<Record<string, unknown>> => {
    const tagIds = await resolveTagIds(tagNames);
    const cleanGratitude = gratitude.map((item) => item.trim()).filter(Boolean);

    if (!entry) {
      return {
        date: targetDate,
        title: title.trim().length > 0 ? title.trim() : undefined,
        content,
        mood,
        energy,
        gratitude: cleanGratitude.length > 0 ? cleanGratitude : undefined,
        tagIds,
      };
    }

    return {
      // `null` is sent for every cleared field, never an omitted key: on PATCH an
      // absent key means "leave this alone", so omitting a cleared value is what
      // made clearing a rating silently do nothing.
      title: title.trim().length > 0 ? title.trim() : null,
      content,
      mood,
      energy,
      gratitude: cleanGratitude,
      tagIds,
    };
  };

  const save = async () => {
    if (saving) return;
    const errorMessage = validate();
    if (errorMessage) {
      setError(errorMessage);
      return;
    }

    setSaving(true);
    setError(null);
    setSavedMessage(null);

    try {
      const payload = await buildPayload();
      const result = await apiRequest<JournalEntryWithRelations>(
        entry ? `/api/journal/${entry.id}` : '/api/journal',
        { method: entry ? 'PATCH' : 'POST', body: payload }
      );

      window.localStorage.removeItem(draftKey);
      setSavedMessage(
        isEditMode ? 'Changes saved — previous version kept in history.' : 'Entry created.'
      );
      onSaved(result);
      notifyJournalDataChanged();
    } catch (err) {
      // The date was already journalled. Rather than fail with "an entry
      // already exists", surface that entry so it can be opened instead — the
      // schema allows one entry per day, so the user's intent is "write about
      // this day", and that is satisfiable.
      if (!entry && err instanceof ApiError && err.status === 409) {
        const existing = (err.details as { entryId?: string } | undefined)?.entryId;
        if (existing) {
          try {
            const found = await apiRequest<JournalEntryWithRelations>(
              `/api/journal/${existing}`
            );
            setOccupied(found);
            setError(
              `You already wrote an entry for this day. Open it to add to it instead.`
            );
            return;
          } catch {
            // Fall through to the generic message below.
          }
        }
      }
      setError(err instanceof Error ? err.message : 'Failed to save journal entry');
    } finally {
      setSaving(false);
    }
  };

  /** A 1–5 picker with a label per option and a toggle-to-clear behaviour. */
  const ratingPicker = (
    label: string,
    value: number | null,
    onChange: (value: number | null) => void,
    labels: Record<number, string>,
    options: readonly number[]
  ) => (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((rating) => {
          const selected = value === rating;
          return (
            <button
              key={rating}
              type="button"
              // Clicking the selected rating clears it: the control is a toggle,
              // so a rating can be removed without a separate Clear affordance
              // that appears and disappears as the value changes.
              aria-pressed={selected}
              aria-label={`${label} ${rating} of 5, ${labels[rating] ?? ''}`.trim()}
              onClick={() => {
                onChange(selected ? null : rating);
                markChanged();
              }}
              className={cn(
                'inline-flex h-9 min-w-10 items-center justify-center rounded-md border px-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selected
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              )}
            >
              {rating}
            </button>
          );
        })}
      </div>
      {value !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          {labels[value] ?? ''}
          <button
            type="button"
            onClick={() => {
              onChange(null);
              markChanged();
            }}
            className="ml-2 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Clear
          </button>
        </p>
      )}
    </div>
  );

  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {entry ? 'Edit entry' : 'New entry'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {entry ? null : (
            <>Filed under {new Date(`${targetDate}T12:00:00`).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}</>
          )}
        </p>
      </div>

      {draftRestored && dirty && (
        <p role="status" className="mb-4 rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary">
          Unsaved draft restored — your in-progress changes were kept.
        </p>
      )}

      {occupied && (
        <div role="alert" className="mb-4 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          <p className="text-foreground">
            You already wrote an entry for this day
            {occupied.title ? `, “${occupied.title}”` : ''}.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => onSaved(occupied)}>
            Open that entry
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            markChanged();
          }}
          placeholder="Entry title (optional)"
          maxLength={MAX_TITLE_LENGTH}
        />

        {/* Writing area first: the title and the prose are the entry. */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">Content</span>
          <RichTextEditor
            value={content}
            onChange={(value) => {
              setContent(value);
              markChanged();
            }}
            placeholder="Write your entry…"
          />
        </div>

        {/* Everything below is metadata, so it sits after the prose. */}
        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          {ratingPicker('Mood', mood, setMood, MOOD_LABELS, JOURNAL_RATINGS)}
          {ratingPicker('Energy', energy, setEnergy, ENERGY_LABELS, JOURNAL_RATINGS)}
        </div>

        <TagInput
          label="Tags"
          value={tagNames}
          onChange={(value) => {
            setTagNames(value);
            markChanged();
          }}
          suggestions={suggestions}
          placeholder="Type and press Enter to add a tag…"
        />

        {/* Gratitude is stored, exported and offered by `/today`. It is collapsed
            by default here: it is a prompt, not part of writing, and four
            always-open rows pushed the save button off the panel. */}
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowGratitude((value) => !value)}
            aria-expanded={showGratitude}
            className="flex w-full items-center gap-2 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Gratitude
            {gratitude.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({gratitude.length})
              </span>
            )}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {showGratitude ? 'Hide' : 'Optional'}
            </span>
          </button>

          {showGratitude && (
            <div className="mt-3 space-y-2">
              {gratitude.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={`Gratitude ${index + 1}`}
                    value={item}
                    placeholder="Something you are glad for…"
                    maxLength={500}
                    onChange={(e) => {
                      const next = [...gratitude];
                      next[index] = e.target.value;
                      setGratitude(next);
                      markChanged();
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove gratitude ${index + 1}`}
                    onClick={() => {
                      setGratitude(gratitude.filter((_, i) => i !== index));
                      markChanged();
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setGratitude([...gratitude, '']);
                  markChanged();
                }}
              >
                Add a gratitude
              </Button>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {savedMessage && (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            {savedMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {dirty && !saving && (
            <span className="mr-auto text-xs text-amber-600 dark:text-amber-400">
              Unsaved changes
            </span>
          )}
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
