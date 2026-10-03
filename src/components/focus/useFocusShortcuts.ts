'use client';

/**
 * `useFocusShortcuts` — the keyboard layer.
 *
 * The audit's finding was blunt: **the focus timer had no keyboard control at
 * all.** Not a poor implementation — none. A `useKeyboard` hook existed in the
 * repo and was not imported by any focus component, while the whole product
 * shipped shortcuts for far less consequential actions.
 *
 * ## The rule that matters most
 *
 * **Shortcuts are disabled while the user is typing.** `Space` is the primary
 * action on this page and also the key that types a space. Without this guard,
 * typing a word into the intent field would pause and resume the timer on every
 * keystroke — and the user would have no idea why. `isTypingTarget` is the single
 * place that decides, so no shortcut has to reimplement it and get it wrong.
 *
 * ## Deliberately not intercepted
 *
 * Browser and assistive-technology combinations are left alone. `Cmd/Ctrl+S`,
 * `Cmd/Ctrl+K` and friends are the user's, not ours, and swallowing them is how a
 * shortcut layer makes an app hostile to keyboard power users.
 */

import { useCallback } from 'react';

import { useKeyboard } from '@/hooks/useKeyboard';
import { FOCUS_MODES, type FocusMode } from '@/lib/focus/type-backfill';

/**
 * True when the event came from somewhere the user is entering text.
 *
 * Checks both the target's tag name and `isContentEditable`, because a contenteditable
 * region does not have a tag name to inspect and is the case most often missed —
 * getting it wrong means the shortcuts fire while someone is editing rich text.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export interface ShortcutHandlers {
  onToggle: () => void;
  onReset: () => void;
  onSkip: () => void;
  onLap: () => void;
  onExtend: () => void;
  onMode: (mode: FocusMode) => void;
  onZen: () => void;
  onHelp: () => void;
}

export function useFocusShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const onKey = useCallback(
    (event: KeyboardEvent) => {
      // Guard first, before anything else. `?` aside, every shortcut below is a
      // printable or activation key that a text field legitimately uses.
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          handlers.onToggle();
          return;
        case 'r':
        case 'R':
          event.preventDefault();
          handlers.onReset();
          return;
        case 's':
        case 'S':
          event.preventDefault();
          handlers.onSkip();
          return;
        case 'l':
        case 'L':
          event.preventDefault();
          handlers.onLap();
          return;
        case 'e':
        case 'E':
          event.preventDefault();
          handlers.onExtend();
          return;
        case 'f':
        case 'F':
          event.preventDefault();
          handlers.onZen();
          return;
        case '?':
          event.preventDefault();
          handlers.onHelp();
          return;
        case '1':
        case '2':
        case '3':
        case '4': {
          event.preventDefault();
          const mode = FOCUS_MODES[Number(event.key) - 1];
          if (mode) handlers.onMode(mode);
          return;
        }
        default:
      }
    },
    [handlers]
  );

  useKeyboard(onKey, { enabled });
}

/**
 * The shortcut table, as data.
 *
 * Rendered by `ShortcutsDialog` and nothing else, so the list a user reads is
 * generated from the same source the handler dispatches on. A hand-written cheat
 * sheet drifts from the implementation within one release; this cannot.
 */
export const FOCUS_SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: 'Space', action: 'Start, pause or resume' },
  { keys: 'R', action: 'Stop and reset' },
  { keys: 'S', action: 'Skip to the next phase' },
  { keys: 'L', action: 'Mark a lap (stopwatch)' },
  { keys: 'E', action: 'Add five minutes' },
  { keys: '1 – 4', action: 'Focus, short break, long break, stopwatch' },
  { keys: 'F', action: 'Zen mode' },
  { keys: '?', action: 'Show this list' },
  { keys: 'Esc', action: 'Leave zen mode' },
];

/** Whether a shortcut would do anything right now. Used to grey out the table. */
export function shortcutAvailable(key: string, status: string, mode: string): boolean {
  const live = status === 'running' || status === 'paused';
  if (key === 'L') return mode === 'stopwatch' && live;
  if (key === 'S' || key === 'E') return live && mode !== 'stopwatch';
  return true;
}

export default useFocusShortcuts;
