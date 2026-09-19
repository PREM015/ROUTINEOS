'use client';

import { useEffect, useRef } from 'react';

export type HotkeyCallback = (event: KeyboardEvent) => void;
export type HotkeyMap = Record<string, HotkeyCallback>;

interface KeyboardHookOptions {
  enabled?: boolean;
}

type KeyboardHandler = HotkeyCallback | HotkeyMap;

/**
 * Keyboard hook: registers a global keydown listener that either invokes a
 * single callback for every key press or dispatches to a map of hotkeys
 * (e.g. `{ 'ctrl+k': fn, escape: fn }`). Combos are normalized so `Ctrl`,
 * `⌃`, and lowercase letters all match. When the handler is a map, `Escape`
 * is normalized to `escape` and modifiers are sorted for stable matching.
 */
function normalizeCombination(event: KeyboardEvent): string {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  const parts: string[] = [];

  if (event.ctrlKey) parts.push('ctrl');
  if (event.metaKey) parts.push('cmd');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');

  if (key === 'control' || key === 'meta' || key === 'alt' || key === 'shift') {
    return parts.join('+');
  }

  parts.push(key === 'escape' ? 'escape' : key);
  return parts.sort().join('+');
}

export function useKeyboard(
  handler: KeyboardHandler,
  options: KeyboardHookOptions = {}
) {
  const { enabled = true } = options;
  const handlerRef = useRef<KeyboardHandler>(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const current = handlerRef.current;

      if (typeof current === 'function') {
        current(event);
        return;
      }

      const combo = normalizeCombination(event);
      const callback = current[combo];
      if (callback) {
        event.preventDefault();
        callback(event);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}