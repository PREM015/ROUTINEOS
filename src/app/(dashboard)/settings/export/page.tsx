'use client';

/**
 * Settings — Export
 * Renders the shared ExportData component, which requests a data export
 * (POST /api/export/request), polls for completion
 * (GET /api/export/status/[id]) and surfaces the download link
 * (GET /api/export/download/[id]).
 */

import { FileDown, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ExportData } from '@/components/data/ExportData';

export default function ExportSettingsPage() {
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
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
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
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="mt-1 text-sm text-gray-600">
          Download a portable copy of your data.
        </p>
      </div>

      <ExportData />

      <Card className="mt-6">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-bold">What is included?</h2>
          </div>
          <ul className="mt-4 list-inside space-y-1 text-sm text-gray-600">
            <li>• Profile, settings and preferences</li>
            <li>• Habits, routines and their logs</li>
            <li>• Goals, projects and tasks</li>
            <li>• Journal entries, sleep and mood records</li>
            <li>• Daily scores and streak history</li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            Exports are available for 7 days and can be requested again at any time.
          </p>
        </div>
      </Card>
    </main>
  );
}