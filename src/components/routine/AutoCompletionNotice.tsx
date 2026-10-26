'use client';

import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';

/**
 * First-visit explainer for automatic completion.
 *
 * Existing users never saw the onboarding copy, so without this the first block
 * that turns "Missed (not logged)" on its own looks like a bug or a lost tick.
 * This is a one-paragraph, dismissible note shown once per device.
 *
 * Gated on a `localStorage` key rather than a `UserSettings` column on purpose:
 * this is a per-device "have I read this yet" flag, exactly like the dashboard
 * widget preferences, and it is not a user preference about behaviour. A schema
 * column would imply it syncs across devices, which it should not — reading the
 * note on one phone should not silence it on another that never showed it.
 *
 * Renders nothing on the server and nothing after dismissal, so it cannot cause
 * a hydration mismatch or reappear.
 */
const STORAGE_KEY = 'routineos.routine.autocompletion.notice';

export function AutoCompletionNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== 'seen') {
        setVisible(true);
      }
    } catch {
      // Private mode / storage disabled: skip the notice rather than throw.
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, 'seen');
    } catch {
      // Nothing to persist to; hiding for this session is the best we can do.
    }
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="flex-1">
        Blocks that end with nothing recorded are now marked{' '}
        <span className="font-medium text-foreground">Missed (not logged)</span> so a
        day you did not open the app never looks the same as a day you skipped. Tap a
        block to correct it, or turn this off in Settings → Scoring.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default AutoCompletionNotice;
