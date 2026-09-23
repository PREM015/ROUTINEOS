"use client";
/**
 * Navigation — client-side link list for sidebars and topbars.
 *
 * Highlights the link matching the current pathname (prefix match, except the
 * exact root path). Links are rendered from `items` (or a default app set) using
 * lucide icons and next/link. The active link gets a shared-layout motion pill
 * that glides between items (skipped under reduced motion). `onNavigate` fires
 * on any link click — handy for closing a mobile drawer.
 *
 * Props:
 * - items: NavigationItem[] ({ label, href, icon }) — defaults to the app nav
 * - orientation: 'vertical' | 'horizontal' stack direction
 * - ariaLabel: label for the nav landmark (default "Primary")
 * - onNavigate: optional click callback
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Calendar, Target, CheckSquare, Settings, Activity } from 'lucide-react';
import { EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavigationProps {
  items?: NavigationItem[];
  orientation?: 'vertical' | 'horizontal';
  ariaLabel?: string;
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
  ariaLabel = 'Primary',
  className,
  onNavigate,
}: NavigationProps) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const isActive = (href: string): boolean => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      aria-label={ariaLabel}
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
              'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-300 ease-out-expo',
              active
                ? 'font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {active &&
              (reduce ? (
                <span aria-hidden="true" className="glow-primary absolute inset-0 rounded-lg bg-primary/10" />
              ) : (
                <motion.span
                  aria-hidden="true"
                  layoutId="nav-active-pill"
                  className="glow-primary absolute inset-0 rounded-lg bg-primary/10"
                  transition={{ duration: 0.35, ease: EASE }}
                />
              ))}
            <Icon className="relative z-10 h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default Navigation;