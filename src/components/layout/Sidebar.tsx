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
  { label: 'Weekly Recap', href: '/recap', icon: RotateCcw },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const { data: session } = useSession();

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 border-r border-border bg-card/70 backdrop-blur-xl shadow-soft p-4 overflow-y-auto z-40">
      <Link href="/dashboard" className="flex items-center gap-2 mb-6 px-2" aria-label="RoutineOS dashboard">
        <Logo size="md" />
      </Link>

      <div className="flex-1 space-y-6">
        <div>
          <p className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Core
          </p>
          <Navigation items={MAIN_LINKS} ariaLabel="Core" />
        </div>

        <div>
          <p className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Features & Insights
          </p>
          <Navigation items={FEATURE_LINKS} ariaLabel="Features & Insights" />
        </div>
      </div>

      {/* User profile / footer info */}
      <div className="pt-4 border-t border-border mt-auto">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
              {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {session?.user?.name || 'User'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {session?.user?.email || ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Sign out"
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;