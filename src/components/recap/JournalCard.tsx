'use client';

import { NotebookPen } from 'lucide-react';
import type { RecapExtras } from '@/types/recap';

interface JournalCardProps {
  journal: RecapExtras['journal'];
}

/**
 * Recent journal entries from the period (newest first) with a content snippet.
 * Source: JournalEntry rows within the recap range.
 */
export default function JournalCard({ journal }: JournalCardProps) {
  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-rose-500/10 p-2 text-rose-500">
          <NotebookPen className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Journal</h2>
      </header>

      {journal.length > 0 ? (
        <ul className="space-y-2">
          {journal.map((entry) => (
            <li key={`${entry.date}-${entry.title}`} className="rounded-xl border border-border/60 bg-card/60 px-3 py-2">
              <p className="text-[11px] tabular-nums text-muted-foreground">{entry.date}</p>
              {entry.title && <p className="mt-0.5 text-sm font-semibold text-foreground">{entry.title}</p>}
              {entry.snippet && (
                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{entry.snippet}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Write journal entries in this period to review them here.
        </p>
      )}
    </section>
  );
}