'use client';

import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HabitCatalogBrowser } from '@/components/habits/HabitCatalogBrowser';
import { AddFromCatalogDialog } from '@/components/habits/AddFromCatalogDialog';
import { StarterPackDialog } from '@/components/habits/StarterPackDialog';
import { Button, Tabs, Card } from '@/components/ui';
import { notifyHabitsDataChanged } from '@/lib/app-events';
import type { HabitDefinitionCard } from '@/types/habit';

/**
 * The habit source screen: browse the shared catalogue, or start from a pack.
 *
 * Two ways in, one rule: **whatever is picked here becomes the user's own
 * habit**, a personal copy. The catalogue is available to every user
 * identically, and the pack is available to every user identically. Nothing on
 * this page differs per account.
 */
export default function HabitCatalogPage() {
  const [selected, setSelected] = useState<HabitDefinitionCard | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [packOpen, setPackOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  /**
   * Refresh every habit list in the app.
   *
   * The app event bus exists because `/today`, `/habits` and the dashboard all
   * hold their own copies of the habit list; adding a habit in this modal has to
   * reach all three, and re-fetching each from here would be three refetches
   * that disagree.
   */
  const onAdded = useCallback((habit: { id: string; name: string }) => {
    setSelected(null);
    // Recorded so the browser can show the habit as "already added" without a
    // refetch, which would otherwise race the list this screen just rendered.
    setAddedIds((prev) => new Set(prev).add(habit.id));
    setBanner(
      `"${habit.name}" added. Edit it any time — the catalogue will not change it.`
    );
    notifyHabitsDataChanged();
  }, []);

  const onPackApplied = useCallback((result: { created: number; skipped: number }) => {
    setBanner(
      result.created > 0
        ? `Added ${result.created} habit${result.created === 1 ? '' : 's'}` +
            (result.skipped > 0
              ? `, left your existing ${result.skipped} untouched`
              : '') +
            '.'
        : 'You already had all of these. Nothing was changed.'
    );
    notifyHabitsDataChanged();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Add habits
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse the shared catalogue or start from a suggested pack. Everything
          you add becomes your own habit — set its own target, and change it
          whenever you like.
        </p>
      </header>

      {banner && (
        <div
          role="status"
          className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground"
        >
          {banner}
        </div>
      )}

      <Tabs
        tabs={[
          {
            id: 'catalog',
            label: 'Browse catalogue',
            content: (
              <HabitCatalogBrowser onAdd={setSelected} addedIds={addedIds} />
            ),
          },
          {
            id: 'packs',
            label: 'Starter packs',
            content: (
              <Card className="space-y-3 p-5">
                <h2 className="font-medium text-foreground">Daily Essentials</h2>
                <p className="text-sm text-muted-foreground">
                  Tier 1 daily essentials, tier 2 scheduled habits that start
                  after your first month, and tier 3 optional growth habits. You
                  will see the full list — grouped by tier, with each habit&apos;s
                  start date — before anything is added.
                </p>
                <p className="text-sm text-muted-foreground">
                  Applying a pack never overwrites a habit you already have, so it
                  is safe to run more than once.
                </p>
                <Button
                  onClick={() => setPackOpen(true)}
                  disabled={packOpen}
                  className="mt-2"
                >
                  {packOpen && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  Preview the pack
                </Button>
              </Card>
            ),
          },
        ]}
      />

      <AddFromCatalogDialog
        definition={selected}
        onClose={() => setSelected(null)}
        onAdded={onAdded}
      />

      <StarterPackDialog
        open={packOpen}
        onClose={() => setPackOpen(false)}
        onApplied={onPackApplied}
      />
    </div>
  );
}