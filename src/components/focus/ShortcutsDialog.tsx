'use client';

/**
 * ShortcutsDialog — the keyboard cheat sheet, generated from the handler.
 *
 * `FOCUS_SHORTCUTS` is the same array the key handler dispatches on, so this list
 * cannot describe a shortcut that was renamed or removed. A hand-written cheat
 * sheet is correct for exactly one release.
 *
 * Unavailable shortcuts are shown greyed rather than hidden: someone pressing `L`
 * and seeing nothing happen needs to know the key exists and why it did nothing.
 */

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';
import { FOCUS_SHORTCUTS, shortcutAvailable } from '@/components/focus/useFocusShortcuts';

export function ShortcutsDialog({
  open,
  onOpenChange,
  status,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: string;
  mode: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Disabled while you are typing in a field.
        </p>

        <dl className="mt-4 divide-y divide-border">
          {FOCUS_SHORTCUTS.map(({ keys, action }) => {
            const available = shortcutAvailable(keys, status, mode);
            return (
              <div key={keys} className="flex items-center justify-between gap-4 py-2">
                <dt>
                  <kbd
                    className={cn(
                      'rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs',
                      !available && 'opacity-40'
                    )}
                  >
                    {keys}
                  </kbd>
                </dt>
                <dd
                  className={cn(
                    'flex-1 text-right text-sm',
                    available ? 'text-foreground' : 'text-muted-foreground/50'
                  )}
                >
                  {action}
                  {!available && (
                    <span className="sr-only"> (not available right now)</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

export default ShortcutsDialog;
