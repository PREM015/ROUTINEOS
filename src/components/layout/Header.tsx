"use client";

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogOut, Settings, User } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { StreakBadge } from '@/components/streak/StreakBadge';
import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Logo } from '@/components/layout/Logo';
import { EASE } from '@/lib/motion';
import { DateSwitcher } from '@/components/layout/DateSwitcher';
import { JumpTo } from '@/components/layout/JumpTo';

export function Header() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();

  const name = session?.user?.name || 'User';
  const initial = name.charAt(0).toUpperCase();

  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/70 backdrop-blur-xl shadow-soft sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-lg text-foreground hidden md:block">
          RoutineOS
        </h2>
        <div className="md:hidden flex items-center gap-2">
          <Logo size="sm" />
        </div>
      </div>

      {/*
        The spec's top bar: "Left: wordmark, small and quiet. Center: Date
        Switcher. Right: a ⌘K search trigger, a notification bell with a dot, and
        the avatar."

        The centre slot is new. It replaces the need for a separate
        calendar-navigation section on every page, because the selected date is
        global (`AppContext.selectedDate`) and the dashboard, analytics, recap
        and habits pages all read it.
      */}
      <div className="hidden md:flex flex-1 justify-center px-4">
        <DateSwitcher />
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <JumpTo />

        {/*
          The streak badge used to be a static flame link labelled "Active
          Streak" with no number, pointing at /achievements. It was decoration in
          shared code: it claimed a streak without ever showing one, on every page
          in the app. `StreakBadge` reads the real value, tiers it grey -> orange
          -> gold, and only reaches gold at the top tier (A2's scarcity rule), so
          the two-pixel detail pays off everywhere rather than only on the
          dashboard.
        */}
        <StreakBadge />

        {/*
          ERROR.md L: the bell used to be a plain link to
          /settings/notifications, so clicking it opened settings instead of the
          notification history, and nothing in the app read
          `GET /api/notifications` at all. `NotificationBell` renders the
          history with category and period filters plus an unread badge; settings
          is still reachable from the foot of the panel.
        */}
        <NotificationBell />

        <ThemeToggle />

        {/* User profile dropdown control */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full bg-muted/60 hover:bg-muted border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer"
            aria-label="User menu"
          >
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shadow-sm">
              {initial}
            </div>
            <span className="text-xs font-medium text-foreground max-w-[100px] truncate hidden sm:inline">
              {name}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {menuOpen && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl bg-card/95 border border-border shadow-long backdrop-blur-xl py-1 origin-top-right z-50"
            >
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-xs font-bold text-foreground truncate">
                  {name}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {session?.user?.email || 'Logged in user'}
                </p>
              </div>

              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                Settings
              </Link>

              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors border-t border-border mt-1 text-left cursor-pointer font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                Log Out
              </button>
            </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

export default Header;
