"use client";
/**
 * Breadcrumb — navigation trail of { label, href } entries.
 *
 * Renders items as links (all but the current one) separated by chevrons. The
 * last item is rendered as plain text with `aria-current="page"`. Each entry
 * fades/rises in with a tiny stagger (skipped under reduced motion).
 *
 * Props:
 * - items: BreadcrumbItem[] ({ label, href? })
 * - separator: custom separator node (default: ChevronRight)
 */

import React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { EASE } from '@/lib/motion';
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
  const reduce = useReducedMotion();

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          const showSeparator = !isCurrent;

          return (
            <motion.li
              key={`${item.label}-${index}`}
              initial={reduce ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay: index * 0.04 }}
              className="flex items-center gap-1.5"
            >
              {item.href !== undefined && !isCurrent ? (
                <Link
                  href={item.href}
                  className="text-muted-foreground transition-colors duration-300 ease-out-expo hover:text-primary"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              )}
              {showSeparator &&
                (separator ?? (
                  <ChevronRight
                    className="h-4 w-4 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                ))}
            </motion.li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;