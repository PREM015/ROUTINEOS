"use client";

/**
 * TagInput — a combobox-style tag field. Users type or pick from `suggestions`
 * and press Enter/comma to add a tag; backspace removes the last chip when the
 * input is empty; a filtered suggestion list can be navigated with the arrow
 * keys. Fully controlled via `value` / `onChange`.
 *
 * Usage:
 *   <TagInput value={tags} onChange={setTags} suggestions={allTagNames} />
 */
import * as React from 'react';
import { Check, Plus } from 'lucide-react';
import TagBadge from './TagBadge';
import { cn } from '@/lib/utils';

export interface TagInputProps {
  /** Currently selected tag values (labels). */
  value: string[];
  onChange: (value: string[]) => void;
  /** Optional list of known tag labels used for autocomplete. */
  suggestions?: string[];
  placeholder?: string;
  label?: string;
  /** Maximum number of selectable tags, 0 = unlimited. */
  maxTags?: number;
  className?: string;
}

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add a tag…',
  label,
  maxTags = 0,
  className,
}: TagInputProps) {
  const [draft, setDraft] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const query = draft.trim().toLowerCase();
    const known = suggestions.filter(
      (item) => !value.includes(item) && (query.length === 0 || item.toLowerCase().includes(query)),
    );
    const unused = known.filter((item) => !value.includes(item));
    return unused.slice(0, 8);
  }, [draft, suggestions, value]);

  const canAdd = maxTags <= 0 || value.length < maxTags;

  const addTag = React.useCallback(
    (raw: string) => {
      const next = raw.trim();
      if (next.length === 0) return;
      if (value.includes(next)) {
        setDraft('');
        return;
      }
      if (!canAdd) return;
      onChange([...value, next]);
      setDraft('');
      setOpen(false);
      setHighlight(0);
    },
    [canAdd, onChange, value],
  );

  const removeTag = React.useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [onChange, value],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && filtered.length > 0) {
        addTag(filtered[Math.min(highlight, filtered.length - 1)] ?? draft);
      } else {
        addTag(draft);
      }
      return;
    }
    if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      removeTag(value.length - 1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((prev) =>
        filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length,
      );
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const selectSuggestion = (index: number) => {
    const item = filtered[index];
    if (item) addTag(item);
  };

  return (
    <div className={cn('w-full', className)}>
      {label && <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {value.map((tag, index) => (
            <TagBadge key={tag} label={tag} onRemove={() => removeTag(index)} />
          ))}
        </div>
      )}
      <div className="relative">
        <div className="flex items-center rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
          {value.length > 0 && <Plus className="ml-3 h-4 w-4 text-gray-400" aria-hidden="true" />}
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ''}
            aria-label={label ?? 'Tags'}
            className="block w-full rounded-md border-0 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        {open && filtered.length > 0 && (
          <ul
            role="listbox"
            aria-label="Tag suggestions"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            {filtered.map((item, index) => (
              <li
                key={item}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(index)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm text-gray-800',
                  index === highlight && 'bg-blue-50 text-blue-700',
                )}
              >
                <span className="truncate">{item}</span>
                {index === highlight && <Check className="h-4 w-4 shrink-0" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}