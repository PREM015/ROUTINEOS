'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { cn } from '@/lib/utils';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface FooterProps {
  className?: string;
  brand?: string;
  year?: number;
  /**
   * Legacy flat link list. When provided it replaces the default first
   * ("Product") column so existing callers keep their behaviour.
   */
  links?: FooterLink[];
  /**
   * Optional full column overrides. When omitted the shared defaults are used
   * so every page ends up with a consistent footer (including Help links to
   * /why, /faq and /about).
   */
  columns?: FooterColumn[];
  children?: React.ReactNode;
}

const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Today', href: '/today' },
      { label: 'Habits', href: '/habits' },
      { label: 'Routine', href: '/routine' },
      { label: 'Goals', href: '/goals' },
      { label: 'Focus', href: '/focus' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { label: 'Journal', href: '/journal' },
      { label: 'Analytics', href: '/analytics' },
      { label: 'Achievements', href: '/achievements' },
      { label: 'Recaps', href: '/recap' },
    ],
  },
  {
    title: 'Help & Info',
    links: [
      { label: 'Why RoutineOS', href: '/why' },
      { label: 'FAQ', href: '/faq' },
      { label: 'About', href: '/about' },
      { label: 'Settings', href: '/settings' },
    ],
  },
];

const BRAND_TAGLINE =
  'A calm workspace for habits, routines, goals, focus, and reflection.';

export function Footer({
  className,
  brand = 'RoutineOS',
  year,
  links,
  columns = DEFAULT_COLUMNS,
  children,
}: FooterProps) {
  // Computed lazily (never during an effect): SSR falls back to a fixed
  // year, the client uses the real one. No hydration mismatch in practice
  // since server and client agree except across a New Year boundary.
  const [currentYear] = useState(
    () => year ?? (typeof window === 'undefined' ? 2026 : new Date().getFullYear())
  );

  const resolvedColumns: FooterColumn[] = links
    ? [{ title: 'Product', links }, ...columns.slice(1)]
    : columns;

  return (
    <footer
      className={cn(
        'mt-auto border-t border-border bg-card/40 px-4 sm:px-6 py-10 sm:py-12',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <Link href="/" aria-label="RoutineOS home">
              <Logo size="md" />
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {BRAND_TAGLINE}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-16">
            {resolvedColumns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {column.title}
                </h3>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="transition-colors hover:text-primary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>
            © {currentYear} {brand}. All rights reserved.
          </span>
          <span className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            {children}
            <span>Built for consistent days.</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;