"use client";
/**
 * AutoSave — debounces a watched value into an async save callback.
 *
 * Watches `value`; after `debounceMs` (default 800) of inactivity it calls
 * `onChange` with the latest value and shows an inline saving/saved indicator.
 * The initial render is skipped by default (`skipInitial`) so mounting a form
 * doesn't immediately fire a save.
 *
 * Props:
 * - value: value to watch (changes trigger a debounced save)
 * - onChange: async save callback receiving the latest value
 * - debounceMs: idle wait before saving (default 800)
 * - skipInitial: don't save on first render (default true)
 * - label / savedLabel: indicator text for saving/saved states
 * - onSaved / onError: callbacks after a successful/failed save
 */

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutoSaveProps<T> {
  value: T;
  onChange: (value: T) => void | Promise<void>;
  debounceMs?: number;
  skipInitial?: boolean;
  label?: string;
  savedLabel?: string;
  className?: string;
  onSaved?: () => void;
  onError?: (error: unknown) => void;
}

export function AutoSave<T>({
  value,
  onChange,
  debounceMs = 800,
  skipInitial = true,
  label = 'Saving…',
  savedLabel = 'Saved',
  className,
  onSaved,
  onError,
}: AutoSaveProps<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>(skipInitial ? 'idle' : 'saving');

  const onChangeRef = useRef(onChange);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onChangeRef.current = onChange;
    onSavedRef.current = onSaved;
    onErrorRef.current = onError;
  }, [onChange, onSaved, onError]);

  const skipRef = useRef(skipInitial);

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }

    setStatus('saving');
    const timer = window.setTimeout(async () => {
      try {
        await onChangeRef.current(value);
        setStatus('saved');
        onSavedRef.current?.();
      } catch (error) {
        setStatus('error');
        onErrorRef.current?.(error);
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [value, debounceMs]);

  if (status === 'idle') {
    return null;
  }

  if (status === 'saving') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-zinc-400', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {label}
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-red-400', className)} role="status">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Save failed
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-green-400', className)} role="status">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      {savedLabel}
    </span>
  );
}

export default AutoSave;