'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnimationsEnabled } from '@/hooks/useAnimationsEnabled';

/**
 * A rail card that can fold away.
 *
 * ## Why folding rather than scrolling
 *
 * The rail grew to six cards, which is more than fits a laptop viewport, and it
 * was scrolling internally. That is a workable answer but a poor one: a reader
 * had to scroll a narrow column to find out what was in it, and every card
 * carried equal visual weight so nothing read as primary.
 *
 * Folding separates the two *answers* on this page instead. Open by default are
 * the ones that describe **now** — where you are in your day — because that is
 * the question that sends someone here. Folded are the ones that compare now to
 * **pattern**: this week, by day type, the overrides you set, what the preset
 * touches. They are reference material, consulted deliberately, and a collapsed
 * heading that states each one's one-line answer is a better index than a scroll.
 *
 * ## A collapsed row still says something
 *
 * A disclosure that collapses to a bare word "More" makes the reader reopen
 * things to find out whether they care. Each summary therefore carries its own
 * value — "3 of 7 tracked", "4 overrides" — so the decision to expand can be
 * made without expanding.
 *
 * ## Motion
 *
 * The chevron rotates and the body fades. Both are gated on
 * `useAnimationsEnabled`, so the OS preference and the in-app setting are
 * honoured together rather than only the former.
 */
export function CollapsibleRailCard({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  /** A short value shown while collapsed, e.g. "4 overrides". */
  summary?: string | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const animationsEnabled = useAnimationsEnabled();

  return (
    <section
      className={cn(
        'glass-panel overflow-hidden rounded-xl border border-border/60',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2 p-4 text-left',
          'transition-colors hover:bg-muted/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {!open && summary && (
            <span className="mt-0.5 block truncate text-xs text-foreground/80">{summary}</span>
          )}
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-200',
            !animationsEnabled && 'transition-none',
            open && 'rotate-180'
          )}
        />
      </button>

      {/*
        `hidden` rather than a height animation. Animating to `auto` is not
        possible without measuring, and a measured accordion on six cards adds a
        layout pass per toggle for a transition nobody needs. The content is
        simply not rendered while folded.
      */}
      {open && <div className="border-t border-border/60 p-4">{children}</div>}
    </section>
  );
}

export default CollapsibleRailCard;
