"use client";
/**
 * Footer — app-level footer with brand, links, and dynamic copyright year.
 *
 * Props:
 * - brand: footer title (default "RoutineOS")
 * - year: override the copyright year (defaults to the current year)
 * - links: optional FooterLink[] ({ label, href }) rendered as a nav
 * - children: arbitrary extra content (e.g. social icons)
 */

import React from 'react';
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

export function Footer({
  className,
  brand = 'RoutineOS',
  year,
  links,
  children,
}: FooterProps) {
  const currentYear = year ?? new Date().getFullYear();

  return (
    <footer
      className={cn(
        'mt-auto border-t border-zinc-800 bg-zinc-900/50 px-6 py-6',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-zinc-400">
          © {currentYear} {brand}. All rights reserved.
        </p>
        {links !== undefined && links.length > 0 && (
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-zinc-400 transition-colors hover:text-blue-400"
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