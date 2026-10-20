"use client";

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { Logo } from '@/components/layout/Logo';
import { Navigation } from '@/components/layout/Navigation';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Calendar, Target, CheckSquare, Activity, Timer, BookOpen, BarChart3, Trophy, RotateCcw, Settings } from 'lucide-react';

interface SidebarLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

const MAIN_LINKS: SidebarLink[] = [
  { label: 'Today', href: '/today', icon: CheckSquare },
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Habits', href: '/habits', icon: Activity },
  { label: 'Routine', href: '/routine', icon: Calendar },
  { label: 'Goals', href: '/goals', icon: Target },
];

const FEATURE_LINKS: SidebarLink[] = [
  { label: 'Focus Mode', href: '/focus', icon: Timer },
  { label: 'Journal', href: '/journal', icon: BookOpen },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Achievements', href: '/achievements', icon: Trophy },
  { label: 'Recap', href: '/recap', icon: RotateCcw },
  { label: 'Settings', href: '/settings', icon: Settings },
];

/**
 * The sidebar's inner content — logo, the two link groups, and the profile
 * footer — shared by the desktop `<aside>` and the mobile navigation drawer
 * (`MobileMenu`), so a phone shows exactly the destinations the PC sidebar
 * shows. The parent must be a flex column; `min-h-full` lets the profile
 * footer sit at the bottom when the content is short.
 *
 * `onNavigate` closes the drawer after a link click, `pillLayoutId` keeps the
 * drawer's active pill from colliding with the (hidden but still mounted)
 * desktop sidebar's pill.
 */
export function SidebarContent({
  onNavigate,
  pillLayoutId,
}: {
  onNavigate?: () => void;
  pillLayoutId?: string;
}) {
  const { data: session } = useSession();

  return (
    <div className="flex min-h-full flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2 mb-6 px-2" aria-label="RoutineOS dashboard">
        <Logo size="md" />
      </Link>

      <div className="flex-1 space-y-6">
        <div>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Core
          </p>
          <Navigation items={MAIN_LINKS} ariaLabel="Core" onNavigate={onNavigate} pillLayoutId={pillLayoutId} />
        </div>

        <div>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Features & Insights
          </p>
          <Navigation items={FEATURE_LINKS} ariaLabel="Features & Insights" onNavigate={onNavigate} pillLayoutId={pillLayoutId} />
        </div>
      </div>

      {/* User profile / footer info */}
      <div className="mt-auto pt-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/60 p-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {session?.user?.name || 'User'}
            </p>
            <p
              className="truncate text-[11px] text-muted-foreground"
              title={session?.user?.email ?? undefined}
            >
              {session?.user?.email || ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    /*
      Narrower in the `md` band than at `lg`.

      A flat `w-64` spent 256px of a 768–1024px viewport — a third of the screen
      — on navigation, which is what crowded the schedule on a small laptop or a
      browser at 125% zoom. `w-56` returns 32px to the content at that width and
      widens back to `w-64` once there is room for it.
    */
    <aside className="hidden md:flex flex-col w-56 lg:w-64 h-screen sticky top-0 border-r border-border bg-card/70 backdrop-blur-xl shadow-soft p-3 lg:p-4 overflow-y-auto z-40">
      <SidebarContent />
    </aside>
  );
}

export default Sidebar;
