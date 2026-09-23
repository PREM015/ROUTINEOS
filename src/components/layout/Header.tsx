"use client";

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Flame, LogOut, Settings, User, Bell } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Logo } from '@/components/layout/Logo';
import { EASE } from '@/lib/motion';

export function Header() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();

  const name = session?.user?.name || 'User';
  const initial = name.charAt(0).toUpperCase();

  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/60 backdrop-blur-md sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-lg text-foreground hidden md:block">
          RoutineOS
        </h2>
        <div className="md:hidden flex items-center gap-2">
          <Logo size="sm" />
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <Link
          href="/achievements"
          className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 rounded-full text-xs font-semibold transition-colors"
        >
          <Flame className="w-4 h-4 fill-current" />
          <span className="hidden sm:inline">Active Streak</span>
        </Link>

        {/* Notifications Icon link */}
        <Link
          href="/settings/notifications"
          className="p-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
        </Link>

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
              className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl bg-card/95 border border-border shadow-floating backdrop-blur-xl py-1 origin-top-right z-50"
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
