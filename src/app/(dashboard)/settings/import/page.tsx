'use client';

/**
 * Settings — Import
 * Renders the real `ImportData` component, which parses a JSON backup file,
 * validates it client-side, previews the recognized entity collections and
 * POSTs the validated payload to /api/import on confirm (habits + goals are
 * merged; every other collection is reported as skipped, never deleted).
 */

import { FileUp, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ImportData } from '@/components/data/ImportData';

export default function ImportSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();

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
            <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Import</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Restore your data from a JSON backup file.
        </p>
      </div>

      <ImportData />

      <Card className="mt-6">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">What is imported?</h2>
          </div>
          <ul className="mt-4 list-inside space-y-1 text-sm text-muted-foreground">
            <li>• Habits and goals are merged into your account (never duplicated, never deleted)</li>
            <li>• Every other collection in the file is reported as skipped with an honest count</li>
            <li>• Nothing is ever wiped — import is entity-merge, never data loss</li>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Use a backup exported from the Export page or downloaded via /api/export/download.
          </p>
        </div>
      </Card>
    </main>
  );
}
