'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  BedDouble,
  CalendarDays,
  Check,
  Moon,
  NotebookPen,
  Search,
  Timer,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { apiRequest } from '@/lib/api-client';
import { toast } from 'sonner';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { enumValueForSlug } from '@/constants/day-types';
import { notifyTodayDataChanged } from '@/lib/today-sync';
import { cn } from '@/lib/utils';

interface HabitOption {
  id: string;
  name: string;
  icon: string | null;
  done: boolean;
}
interface DayTypeOption {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * 2.9 — Cmd+K command palette.
 *
 * Four actions the spec asks for, each of which hits the **real** API rather than
 * faking a state change:
 *
 *   log a habit        POST /api/habits/{id}/log      (COMPLETED / MISSED)
 *   start sleep        POST /api/sleep/session/start
 *   switch day type    POST /api/day-mode             { mode: 'DAY_TYPE', ... }
 *   jump to Reflection scroll to the reflection card
 *
 * Habits and day types are fetched when the palette first opens rather than on
 * mount, so a page that never uses the palette never pays for the requests.
 */
export function CommandPalette() {
  const router = useRouter();
  const { today } = useUserTimezone();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [habits, setHabits] = useState<HabitOption[]>([]);
  const [dayTypes, setDayTypes] = useState<DayTypeOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Global shortcut. `navigator` guards the server render.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const load = useCallback(async () => {
    if (loaded || busy) return;
    setBusy(true);
    try {
      /**
       * `apiRequest` ALREADY unwraps the `{ success, data }` envelope and
       * resolves to `envelope.data`. This previously typed the result as
       * `{ data?: HabitOption[] }` and then read `.data` a second time, so both
       * lists resolved to `undefined ?? []` and the "Habits" and "Day type"
       * groups never rendered at all — the palette silently showed only the four
       * static commands, with no error and no empty state.
       *
       * The generic parameter describes the RESOLVED value, not the envelope.
       */
      const [habitList, dayTypeList] = await Promise.all([
        apiRequest<
          Array<{ id: string; name: string; icon: string | null; log?: { status: string } | null }>
        >(`/api/habits/today?date=${today}`),
        apiRequest<DayTypeOption[]>('/api/day-types?active=true'),
      ]);
      setHabits(
        (Array.isArray(habitList) ? habitList : []).map((h) => ({
          id: h.id,
          name: h.name,
          icon: h.icon,
          done: h.log?.status === 'COMPLETED',
        }))
      );
      setDayTypes(Array.isArray(dayTypeList) ? dayTypeList : []);
      setLoaded(true);
    } catch {
      // The palette still works for navigation even if the lists fail. Not
      // marking `loaded` here means a later open retries, rather than one
      // transient failure disabling the lists for the page's lifetime.
    } finally {
      setBusy(false);
    }
  }, [loaded, busy, today]);

  useEffect(() => {
    if (open) void load();
    else setQuery('');
  }, [open, load]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setOpen(false);
      setQuery('');
      try {
        await fn();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Action failed');
      }
    },
    []
  );

  const logHabit = (h: HabitOption) =>
    run(async () => {
      const status = h.done ? 'MISSED' : 'COMPLETED';
      const res = await fetch(`/api/habits/${h.id}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          status,
          completedAt: status === 'COMPLETED' ? new Date().toISOString() : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not log that habit');
      setHabits((prev) => prev.map((x) => (x.id === h.id ? { ...x, done: status === 'COMPLETED' } : x)));
      /**
       * `router.refresh()` re-renders **server** components only. The habit card
       * and the day-type card are client components holding `useState`, so they
       * stayed stale until a hard reload — the checkbox would tick in the
       * palette while the card still showed the old value. Both cards already
       * listen for `day-mode-changed`, so dispatching it is the in-app contract.
       *
       * `router.refresh()` is also a server-component refresh, so on its own it
       * could not be the thing that fixes the habit card. `today-data-changed`
       * is the event the `/today` cards actually subscribe to; dispatching both
       * keeps `/dashboard`'s `RightNow`/`Timeline` in step too.
       */
      window.dispatchEvent(new Event('day-mode-changed'));
      notifyTodayDataChanged();
      toast.success(`${h.name} ${status === 'COMPLETED' ? 'done' : 'marked not done'}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            const back = status === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
            void fetch(`/api/habits/${h.id}/log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                date: today,
                status: back,
                completedAt: back === 'COMPLETED' ? new Date().toISOString() : null,
              }),
            }).then(() => {
              setHabits((prev) => prev.map((x) => (x.id === h.id ? { ...x, done: back === 'COMPLETED' } : x)));
              notifyTodayDataChanged();
              router.refresh();
            });
          },
        },
      });
      router.refresh();
    });

  const setDayType = (d: DayTypeOption) =>
    run(async () => {
      /**
       * The enum has no room for user-defined day types, so every one of them
       * collapses to `CUSTOM` in the column. Hardcoding `'CUSTOM'` here
       * therefore wrote a generic custom day for *every* selection — including
       * the user's own "Work Day" — so `DAY_TYPE_CONFIG` resolved the grey
       * gear icon instead of the type's own, and any consumer keyed on
       * `dayType` rather than `dayTypeId` saw the wrong day. `DayContextSelector`
       * already resolves the real enum from the slug; do the same here and keep
       * `dayTypeId` as the identity.
       */
      await apiRequest('/api/day-mode', {
        method: 'POST',
        body: {
          date: today,
          mode: 'DAY_TYPE',
          dayType: enumValueForSlug(d.slug),
          dayTypeId: d.id,
        },
      });
      toast.success(`Day type set to ${d.name}`);
      window.dispatchEvent(new Event('day-mode-changed'));
      notifyTodayDataChanged();
      router.refresh();
    });

  const startSleep = () =>
    run(async () => {
      await apiRequest('/api/sleep/session/start', { method: 'POST' });
      toast.success('Sleep session started');
      notifyTodayDataChanged();
      router.refresh();
    });

  return (
    <>
      {/* Trigger, so the feature is discoverable without knowing the shortcut. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-lg border border-border bg-background/60 px-3',
          'text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Search or run a command</span>
        <kbd className="ml-1 hidden rounded border border-border px-1 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg overflow-hidden p-0">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <Command
            label="Command palette"
            // `loop` keeps the list usable when a query matches nothing.
            loop
            className="flex max-h-[70vh] flex-col"
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Log a habit, start sleep, switch day type…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                No matching command.
              </Command.Empty>

              {habits.length > 0 && (
                <Command.Group
                  heading="Habits"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {habits.map((h) => (
                    <Command.Item
                      key={h.id}
                      value={`habit ${h.name}`}
                      onSelect={() => logHabit(h)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-muted"
                    >
                      <span aria-hidden="true">{h.icon ?? '🌱'}</span>
                      <span className="flex-1 truncate">{h.name}</span>
                      {h.done && <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />}
                      <Hint>{h.done ? 'mark not done' : 'mark done'}</Hint>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {dayTypes.length > 0 && (
                <Command.Group
                  heading="Day type"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {dayTypes.map((d) => (
                    <Command.Item
                      key={d.id}
                      value={`day type ${d.name}`}
                      onSelect={() => setDayType(d)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-muted"
                    >
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="flex-1 truncate">{d.name}</span>
                      <Hint>set today</Hint>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group
                heading="Go to / start"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <Command.Item
                  value="start sleep now go to sleep"
                  onSelect={startSleep}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-muted"
                >
                  <BedDouble className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">Start sleep tracking</span>
                  <Hint>now</Hint>
                </Command.Item>
                <Command.Item
                  value="reflection journal today"
                  onSelect={() =>
                    run(async () => {
                      document
                        .getElementById('today-reflection')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    })
                  }
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-muted"
                >
                  <NotebookPen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">Jump to reflection</span>
                  <Hint>scroll</Hint>
                </Command.Item>
                <Command.Item
                  value="go to sleep card"
                  onSelect={() =>
                    run(async () => {
                      document.getElementById('today-sleep')?.scrollIntoView({ behavior: 'smooth' });
                    })
                  }
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-muted"
                >
                  <Moon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">Jump to sleep</span>
                  <Hint>scroll</Hint>
                </Command.Item>
                <Command.Item
                  value="go to focus timer"
                  onSelect={() => run(async () => router.push('/focus'))}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-muted"
                >
                  <Timer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">Go to focus</span>
                  <Hint>page</Hint>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 text-[10px] text-muted-foreground">{children}</span>
  );
}
