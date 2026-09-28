'use client';

/**
 * Settings — Data
 *
 * The previous version of this page was a static server component whose
 * "Export JSON" button had no `onClick` and whose file input had no
 * `onChange` — both were dead. `POST /api/export/request` and `POST /api/import`
 * both existed and both work, so this page now renders the shared
 * `ExportData` / `ImportData` components that drive them, and adds the
 * data-lifecycle controls (`dataRetentionDays`, `retroactiveEditDays`,
 * `autoArchiveCompletedDays`) that had schema + Prisma columns but no UI.
 */

import { useState } from 'react';
import { CheckCircle2, Database, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { ExportData } from '@/components/data/ExportData';
import { ImportData } from '@/components/data/ImportData';
import {
  RETENTION_OPTIONS,
  EDIT_WINDOW_OPTIONS,
  ARCHIVE_OPTIONS,
} from '@/lib/constants/data-lifecycle';

export default function DataSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { settings, loading, save, patchLocal, saving, error } = useSettings();

  const [saved, setSaved] = useState(false);

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  const persist = async () => {
    if (!settings) return;
    const result = await save({
      dataRetentionDays: settings.dataRetentionDays,
      retroactiveEditDays: settings.retroactiveEditDays,
      autoArchiveCompletedDays: settings.autoArchiveCompletedDays,
    });
    if (result) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    }
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Data Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export, restore and control how long your RoutineOS data is kept.
        </p>
      </div>

      <div className="space-y-6">
        <ExportData />
        <ImportData />

        <Card>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Data lifecycle</h2>
          </div>

          {loading || !settings ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-5 p-6">
              <div className="max-w-sm">
                <Select
                  label="Data retention"
                  value={String(settings.dataRetentionDays)}
                  onChange={(event) =>
                    patchLocal({ dataRetentionDays: Number(event.target.value) })
                  }
                  options={RETENTION_OPTIONS}
                  helperText="How long completed days are kept before being eligible for cleanup."
                />
              </div>

              <div className="max-w-sm">
                <Select
                  label="Retroactive edit window"
                  value={String(settings.retroactiveEditDays)}
                  onChange={(event) =>
                    patchLocal({ retroactiveEditDays: Number(event.target.value) })
                  }
                  options={EDIT_WINDOW_OPTIONS}
                  helperText="How far back you can still log a habit after the fact."
                />
              </div>

              <div className="max-w-sm">
                <Select
                  label="Auto-archive after"
                  value={String(settings.autoArchiveCompletedDays)}
                  onChange={(event) =>
                    patchLocal({ autoArchiveCompletedDays: Number(event.target.value) })
                  }
                  options={ARCHIVE_OPTIONS}
                  helperText="Days move to the archive after this many days."
                />
              </div>

              {error && (
                <div
                  className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={() => void persist()} isLoading={saving}>
                  Save data settings
                </Button>
                {saved && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Saved
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
