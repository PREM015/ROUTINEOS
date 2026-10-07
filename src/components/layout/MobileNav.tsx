"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { LayoutDashboard, Target, CheckSquare, Menu, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMobileMenuStore } from '@/store/mobile-menu.store';

export function MobileNav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const setMenuOpen = useMobileMenuStore((s) => s.setOpen);

  const links = [
    { name: 'Today', href: '/today', icon: CheckSquare },
    { name: 'Habits', href: '/habits', icon: Activity },
    { name: 'Dash', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Goals', href: '/goals', icon: Target },
  ];

  const isLinkActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  /*
    "More" used to be a link to /settings, which left Focus, Journal, Analytics,
    Achievements and Recap unreachable from the bottom bar. It now opens the
    full navigation drawer, and glows whenever the current page is not one of
    the four pinned links — so a page reached through the drawer still shows
    where you are.
  */
  const moreActive = !links.some((link) => isLinkActive(link.href));

  const itemClassName = (active: boolean) =>
    cn(
      'relative flex w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-300 ease-out-expo active:scale-[0.94]',
      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
    );

  const activePill = reduce ? (
    <span aria-hidden="true" className="glow-primary absolute inset-1 rounded-xl bg-primary/10" />
  ) : (
    <motion.span
      aria-hidden="true"
      layoutId="mobile-nav-active"
      className="glow-primary absolute inset-1 rounded-xl bg-primary/10"
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    />
  );

  return (
    <nav
      aria-label="Mobile"
      className="fixed bottom-0 left-0 right-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch justify-around border-t border-border bg-card/85 px-2 backdrop-blur-xl shadow-soft md:hidden"
    >
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = isLinkActive(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={itemClassName(isActive)}
          >
            {isActive && activePill}
            <Icon className="relative z-10 h-5 w-5" aria-hidden="true" />
            <span className="relative z-10">{link.name}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        className={itemClassName(moreActive)}
      >
        {moreActive && activePill}
        <Menu className="relative z-10 h-5 w-5" aria-hidden="true" />
        <span className="relative z-10">More</span>
      </button>
    </nav>
  );
}

export default MobileNav;
