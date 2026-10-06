'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  ListOrdered,
  RotateCcw,
} from 'lucide-react';
import type { AnalyticsDashboard } from '@/types/analytics';
import { buildExportRows, toCsv, toSummaryText } from '@/lib/analytics/export';
import {
  clearStored,
  readStored,
  writeStored,
} from '@/lib/analytics/device-storage';

/**
 * Export, view density, and which rooms this user wants to see.
 *
 * Everything here is device-local and namespaced by user id, and every control says so.
 * The honesty matters more than it might seem: a user who sets a target, hides two rooms
 * and then finds them gone on another device has been told something untrue if the UI
 * implied these were account settings.
 *
 * The CSV is built in the browser from the payload already in memory. Fetching it again to
 * format it differently would be the one thing guaranteed to make an export stop matching
 * the screen, which is the whole promise.
 */
export function ViewsToolbar({
  payload,
  hiddenRooms,
  onHiddenRoomsChange,
  onOpenReview,
}: {
  payload: AnalyticsDashboard;
  hiddenRooms: string[];
  onHiddenRoomsChange: (next: string[]) => void;
  onOpenReview: () => void;
}) {
  const [copied, setCopied] = useState<'none' | 'csv' | 'summary'>('none');

  const csv = useMemo(() => toCsv(buildExportRows(payload)), [payload]);
  const summary = useMemo(() => toSummaryText(payload), [payload]);

  const copy = useCallback(async (text: string, which: 'csv' | 'summary') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied('none'), 2000);
    } catch {
      // Clipboard can be refused by permission policy or absent on an insecure origin.
      // The download button is the fallback, so this is not worth an error message.
      setCopied('none');
    }
  }, []);

  const downloadCsv = useCallback(() => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `analytics-${payload.range.start}-to-${payload.range.end}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [csv, payload.range.end, payload.range.start]);

  const print = useCallback(() => window.print(), []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolbarButton onClick={downloadCsv} icon={<Download className="h-3.5 w-3.5" />}>
        Export CSV
      </ToolbarButton>

      <ToolbarButton
        onClick={() => void copy(summary, 'summary')}
        icon={
          copied === 'summary' ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )
        }
      >
        {copied === 'summary' ? 'Copied' : 'Copy summary'}
      </ToolbarButton>

      <ToolbarButton onClick={() => void copy(csv, 'csv')} icon={<Copy className="h-3.5 w-3.5" />}>
        {copied === 'csv' ? 'Copied' : 'Copy CSV'}
      </ToolbarButton>

      <ToolbarButton onClick={print} icon={<Download className="h-3.5 w-3.5" />}>
        Print
      </ToolbarButton>

      <ToolbarButton onClick={onOpenReview} icon={<Eye className="h-3.5 w-3.5" />}>
        Review this period
      </ToolbarButton>

      <RoomVisibilityMenu hiddenRooms={hiddenRooms} onChange={onHiddenRoomsChange} />

      <p className="w-full text-[11px] text-muted-foreground sm:w-auto">
        Layout and targets are stored on this device.
      </p>
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}

const ROOMS = [
  { id: 'routine-habits', label: 'Routine & Habits' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'work', label: 'Work' },
  { id: 'growth', label: 'Growth' },
] as const;

/**
 * Hide and show the domain rooms.
 *
 * A `<details>` disclosure rather than a custom popover: it is keyboard reachable, it
 * closes on Escape, and it works with no JavaScript state to keep in sync. The alternative
 * would be a menu that traps focus and needs its own dismissal wiring for no gain.
 */
function RoomVisibilityMenu({
  hiddenRooms,
  onChange,
}: {
  hiddenRooms: string[];
  onChange: (next: string[]) => void;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const toggle = (id: string) => {
    const next = hiddenRooms.includes(id)
      ? hiddenRooms.filter((room) => room !== id)
      : [...hiddenRooms, id];
    onChange(next);
    writeStored('layout', userId, { hiddenRooms: next });
  };

  const hiddenCount = hiddenRooms.filter((id) => ROOMS.some((room) => room.id === id)).length;

  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
        Rooms
        {hiddenCount > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
            {hiddenCount} hidden
          </span>
        )}
      </summary>

      <div className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-border/60 bg-card p-2 shadow-soft">
        <ul>
          {ROOMS.map((room) => {
            const hidden = hiddenRooms.includes(room.id);
            return (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => toggle(room.id)}
                  aria-pressed={!hidden}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {hidden ? (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="flex-1">{room.label}</span>
                  <span className="text-[10px] text-muted-foreground">{hidden ? 'Hidden' : 'Shown'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => {
            clearStored('layout', userId);
            onChange([]);
          }}
          className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border/40 px-2 pt-2 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Reset layout
        </button>
      </div>
    </details>
  );
}

/**
 * Load the hidden-room list for this user.
 *
 * A hook rather than a `useState` initialiser because the key depends on the session,
 * which resolves after first paint — reading it during render would permanently cache
 * the `anonymous` value from before sign-in.
 */
export function useHiddenRooms(): [string[], (next: string[]) => void] {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  /*
    One state, not two.

    "Which user is this layout for" and "what is in it" are the same fact, and loading
    them together makes the load a single atomic update rather than two renders with a
    frame between them where the list belongs to the previous account.
  */
  const [layout, setLayout] = useState<{ userKey: string; hiddenRooms: string[] }>({
    userKey: '',
    hiddenRooms: [],
  });

  useEffect(() => {
    if (status === 'loading') return;
    const key = userId ?? 'anonymous';
    if (layout.userKey === key) return;

    const stored = readStored<{ hiddenRooms?: unknown }>(
      'layout',
      userId,
      { hiddenRooms: [] }
    );
    const list = Array.isArray(stored.hiddenRooms)
      ? stored.hiddenRooms.filter((entry): entry is string => typeof entry === 'string')
      : [];

    // Reading device storage is a side effect, so it belongs in an effect, and there is
    // no derived value to compute instead — the value is whatever this device holds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout({ userKey: key, hiddenRooms: list });
  }, [layout.userKey, status, userId]);

  return [
    layout.hiddenRooms,
    useCallback(
      (next: string[]) => setLayout((current) => ({ ...current, hiddenRooms: next })),
      []
    ),
  ];
}