"use client";
/**
 * FieldArray — editable array fields backed by the nearest `<Form>` context.
 *
 * Reads `values[name]` (falling back to `[]` when not an array) and exposes
 * push/remove/update helpers to `renderItem`, which receives
 * `(item, index, helpers)`. Each rendered row is wrapped with a remove button
 * and an "Add" button is rendered below the list.
 *
 * Props:
 * - name: form-context key holding the array
 * - createItem: factory producing a new blank item (preferred over initialItem)
 * - initialItem: template cloned via structuredClone for new items
 * - minItems / maxItems: bound the number of items (remove/add disabled at limits)
 * - renderItem: (item, index, helpers) => ReactNode
 * - addLabel / removeLabel: button text and aria-labels
 */

import React, { useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useFormContext } from './Form';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface FieldArrayHelpers {
  /** Append a new item (respects maxItems). */
  push: () => void;
  /** Remove the item at `index` (respects minItems). */
  remove: (index: number) => void;
  /** Replace the item at `index`. */
  update: (index: number, value: unknown) => void;
}

export interface FieldArrayProps {
  name: string;
  createItem?: () => unknown;
  initialItem?: unknown;
  minItems?: number;
  maxItems?: number;
  className?: string;
  itemClassName?: string;
  addLabel?: string;
  removeLabel?: string;
  renderItem: (item: unknown, index: number, helpers: FieldArrayHelpers) => React.ReactNode;
}

/** Deep-clone plain form data; falls back to a shallow copy. */
function cloneItem(item: unknown): unknown {
  try {
    return structuredClone(item);
  } catch {
    if (typeof item === 'object' && item !== null) {
      return { ...(item as Record<string, unknown>) };
    }
    return item;
  }
}

export function FieldArray({
  name,
  createItem,
  initialItem,
  minItems,
  maxItems,
  className,
  itemClassName,
  addLabel = 'Add item',
  removeLabel = 'Remove',
  renderItem,
}: FieldArrayProps) {
  const { values, setFieldValue } = useFormContext<Record<string, unknown>>();
  const raw = values[name];
  const items = Array.isArray(raw) ? (raw as unknown[]) : [];

  const buildItem = (): unknown => {
    if (createItem !== undefined) {
      return createItem();
    }
    if (initialItem === undefined) {
      return '';
    }
    return cloneItem(initialItem);
  };

  // Seed the array up to minItems on mount so `remove` always has a floor.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) {
      return;
    }
    seededRef.current = true;
    if (minItems !== undefined && items.length < minItems) {
      const padding = Array.from({ length: minItems - items.length }, buildItem);
      setFieldValue(name, [...items, ...padding]);
    }
    // Runs once on mount by design; captures the initial values snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeDisabled = minItems !== undefined && items.length <= minItems;
  const addDisabled = maxItems !== undefined && items.length >= maxItems;

  const push = () => {
    if (addDisabled) {
      return;
    }
    setFieldValue(name, [...items, buildItem()]);
  };

  const remove = (index: number) => {
    if (removeDisabled || index < 0 || index >= items.length) {
      return;
    }
    setFieldValue(
      name,
      items.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const update = (index: number, value: unknown) => {
    if (index < 0 || index >= items.length) {
      return;
    }
    setFieldValue(
      name,
      items.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  };

  const helpers: FieldArrayHelpers = { push, remove, update };

  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item, index) => (
        <div key={index} className={cn('flex items-start gap-2', itemClassName)}>
          <div className="min-w-0 flex-1">{renderItem(item, index, helpers)}</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(index)}
            disabled={removeDisabled}
            aria-label={`${removeLabel} item ${index + 1}`}
            className="mt-1"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={push} disabled={addDisabled}>
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}

export default FieldArray;