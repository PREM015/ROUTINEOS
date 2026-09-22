"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterProps {
  className?: string;
  brand?: string;
  year?: number;
  links?: FooterLink[];
  children?: React.ReactNode;
}

const DEFAULT_LINKS: FooterLink[] = [
  { label: 'Today', href: '/today' },
  { label: 'Habits', href: '/habits' },
  { label: 'Routine', href: '/routine' },
  { label: 'Goals', href: '/goals' },
  { label: 'Focus', href: '/focus' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Settings', href: '/settings' },
];

export function Footer({
  className,
  brand = 'RoutineOS',
  year,
  links = DEFAULT_LINKS,
  children,
}: FooterProps) {
  // Computed lazily (never during an effect): SSR falls back to a fixed
  // year, the client uses the real one. No hydration mismatch in practice
  // since server and client agree except across a New Year boundary.
  const [currentYear] = useState(
    () => year ?? (typeof window === 'undefined' ? 2026 : new Date().getFullYear())
  );

  return (
    <footer
      className={cn(
        'mt-auto border-t border-border bg-card/40 px-4 sm:px-6 py-4',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          © {currentYear} {brand}. All rights reserved.
        </p>
        {links && links.length > 0 && (
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        {children}
      </div>
    </footer>
  );
}

export default Footer;