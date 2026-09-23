"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { LayoutDashboard, Target, CheckSquare, Settings, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const links = [
    { name: 'Today', href: '/today', icon: CheckSquare },
    { name: 'Habits', href: '/habits', icon: Activity },
    { name: 'Dash', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Goals', href: '/goals', icon: Target },
    { name: 'More', href: '/settings', icon: Settings },
  ];

  return (
    <nav
      aria-label="Mobile"
      className="fixed bottom-0 left-0 right-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch justify-around border-t border-border bg-card/85 px-2 backdrop-blur-xl shadow-soft md:hidden"
    >
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-300 ease-out-expo active:scale-[0.94]',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {isActive
              ? reduce
                ? (
                    <span
                      aria-hidden="true"
                      className="glow-primary absolute inset-1 rounded-xl bg-primary/10"
                    />
                  )
                : (
                    <motion.span
                      aria-hidden="true"
                      layoutId="mobile-nav-active"
                      className="glow-primary absolute inset-1 rounded-xl bg-primary/10"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )
              : null}
            <Icon className="relative z-10 h-5 w-5" aria-hidden="true" />
            <span className="relative z-10">{link.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileNav;