"use client";
/**
 * Breadcrumb — navigation trail of { label, href } entries.
 *
 * Renders items as links (all but the current one) separated by chevrons. The
 * last item is rendered as plain text with `aria-current="page"`.
 *
 * Props:
 * - items: BreadcrumbItem[] ({ label, href? })
 * - separator: custom separator node (default: ChevronRight)
 */

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  separator?: React.ReactNode;
}

export function Breadcrumb({ items, className, separator }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          const showSeparator = !isCurrent;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href !== undefined && !isCurrent ? (
                <Link
                  href={item.href}
                  className="text-zinc-400 transition-colors hover:text-blue-400"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(isCurrent ? 'font-medium text-zinc-100' : 'text-zinc-400')}
                >
                  {item.label}
                </span>
              )}
              {showSeparator &&
                (separator ?? (
                  <ChevronRight className="h-4 w-4 text-zinc-600" aria-hidden="true" />
                ))}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;