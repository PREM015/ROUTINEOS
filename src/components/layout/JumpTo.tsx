'use client';

/**
 * Jump To — the header's command trigger.
 *
 * The spec asks for a `⌘K` trigger styled as a soft input: "Jump to… or press
 * ⌘K", available from every screen.
 *
 * This is a **navigation** palette, deliberately separate from
 * `components/today/CommandPalette.tsx`, which is a *data* palette: it fetches
 * the user's habits and day types to log a habit or switch day type. Those two
 * would fight over the same key binding, so the data palette keeps ⌘K on
 * `/today` only, and this one owns it everywhere else — the palette that opens
 * depends on where you are, and each one does the thing that is useful there.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Moon,
  Search,
  Settings,
  Target,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { usePathname } from 'next/navigation';

const DESTINATIONS = [
  { label: 'Today', href: '/today', icon: CheckSquare, hint: 'Habits & routine' },
  { label: 'Dashboard', href: '/dashboard', icon: BarChart3, hint: 'Overview' },
  { label: 'Habits', href: '/habits', icon: CheckSquare, hint: 'Manage habits' },
  { label: 'Routine', href: '/routine', icon: CalendarDays, hint: 'Time blocks' },
  { label: 'Goals', href: '/goals', icon: Target, hint: 'Goals & milestones' },
  { label: 'Focus', href: '/focus', icon: Timer, hint: 'Pomodoro & deep work' },
  { label: 'Journal', href: '/journal', icon: BookOpen, hint: 'Reflections' },
  { label: 'Wellness', href: '/wellness', icon: Moon, hint: 'Sleep & check-ins' },
  { label: 'Achievements', href: '/achievements', icon: Trophy, hint: 'Badges' },
  { label: 'Settings', href: '/settings', icon: Settings, hint: 'Preferences' },
];

export function JumpTo() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Jump to…</span>
        <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px]">
          ⌘K
        </kbd>
      </button>

      {/*
        A plain icon button below `lg`, where the pill has no room (between md
        and lg the sidebar steals 256px of header width). Same affordance,
        same key binding.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Jump to (Command K)"
        className="rounded-full border border-border bg-card/60 p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogTitle className="sr-only">Jump to</DialogTitle>
          <Command
            label="Jump to"
            loop
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Command.Input
                autoFocus
                placeholder="Jump to…"
                className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                No matches.
              </Command.Empty>
              <Command.Group heading="Go to">
                {DESTINATIONS.map((d) => {
                  const Icon = d.icon;
                  const isHere = pathname === d.href;
                  return (
                    <Command.Item
                      key={d.href}
                      value={`${d.label} ${d.hint}`}
                      onSelect={() => go(d.href)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-muted"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="flex-1 text-foreground">
                        {d.label}
                        {isHere && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            current
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{d.hint}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
