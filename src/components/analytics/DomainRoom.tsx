'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One expandable group of domain cards.
 *
 * ## Why grouping is display-only
 *
 * The twelve detail cards were always fetched together, whether or not the disclosure
 * was open, and they still are. This component changes what is *visible* and nothing
 * about what the server computes — which is worth being precise about, because a
 * disclosure that looks like it defers loading invites the belief that opening the page
 * costs less than it does.
 *
 * The one thing this genuinely adds is that the group header states what is inside it,
 * so a collapsed page is navigable rather than a single row of text saying "Show".
 */
export function DomainRoom({
  title,
  summary,
  children,
  defaultOpen = false,
  hidden = false,
}: {
  title: string;
  /** One line describing what the group holds, shown whether open or closed. */
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /**
   * Hidden by the user's own layout choice.
   *
   * Renders nothing at all rather than a collapsed placeholder: a room the user chose to
   * hide should leave no trace, and a disabled-looking section would still occupy the
   * reading order and still be reachable by keyboard.
   */
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (hidden) return null;

  return (
    <section className="glass-panel rounded-2xl shadow-soft">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-colors hover:bg-card/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {summary}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-250 ease-out motion-reduce:transition-none',
              open && 'rotate-180'
            )}
          />
        </button>
      </h2>

      {/*
        The panel is unmounted when closed rather than hidden, so a collapsed page does
        not pay to reconcile twelve card subtrees it cannot show. That is a rendering
        decision, not a data one: every dataset behind these cards was already fetched.
      */}
      {open && (
        <div id={panelId} className="border-t border-border/40 p-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">{children}</div>
        </div>
      )}
    </section>
  );
}
