"use client";
/**
 * Navigation — client-side link list for sidebars and topbars.
 *
 * Highlights the link matching the current pathname (prefix match, except the
 * exact root path). Links are rendered from `items` (or a default app set) using
 * lucide icons and next/link. `onNavigate` fires on any link click — handy for
 * closing a mobile drawer.
 *
 * Props:
 * - items: NavigationItem[] ({ label, href, icon }) — defaults to the app nav
 * - orientation: 'vertical' | 'horizontal' stack direction
 * - onNavigate: optional click callback
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Calendar, Target, CheckSquare, Settings, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavigationProps {
  items?: NavigationItem[];
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  onNavigate?: () => void;
}

const DEFAULT_ITEMS: NavigationItem[] = [
  { label: 'Today', href: '/today', icon: CheckSquare },
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Habits', href: '/habits', icon: Activity },
  { label: 'Routine', href: '/routine', icon: Calendar },
  { label: 'Goals', href: '/goals', icon: Target },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Navigation({
  items = DEFAULT_ITEMS,
  orientation = 'vertical',
  className,
  onNavigate,
}: NavigationProps) {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      aria-label="Primary"
      className={cn(
        orientation === 'vertical'
          ? 'flex flex-col space-y-1'
          : 'flex items-center gap-1',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-blue-500/10 font-medium text-blue-400'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default Navigation;