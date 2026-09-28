'use client';

/**
 * Settings — Privacy
 *
 * `profilePublic` and `shareStats` round-trip through `PUT /api/settings`
 * correctly, but nothing ever read them: `GET /api/users/[id]` returned a
 * profile to anyone who asked and the leaderboard exposed aggregate stats
 * unconditionally. The public-profile route now consults `profilePublic`
 * (below) and the leaderboard consults `shareStats`, so these switches gate
 * something real.
 *
 * Reads and writes go through the shared settings store, so this page can no
 * longer disagree with `/settings/notifications` about the same row.
 */

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, Share2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';

export default function PrivacySettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { settings, loading, save, patchLocal, saving, error } = useSettings();

  const [saved, setSaved] = useState(false);

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-56 rounded-xl" />
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
            <Link
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const persist = async () => {
    if (!settings) return;
    const result = await save({
      profilePublic: settings.profilePublic,
      shareStats: settings.shareStats,
    });
    if (result) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    }
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Privacy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control who can see your profile and stats.
        </p>
      </div>

      <Card>
        <div className="p-6">
          {loading || !settings ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm font-medium text-foreground">Public profile</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    When off, <code className="font-mono">/api/users/[id]</code>{' '}
                    returns 404 for everyone, including the leaderboard. Your
                    name, bio and avatar are not readable by other users.
                  </p>
                </div>
                <Switch
                  label="Public profile"
                  description="Let other users view your profile page and bio."
                  checked={settings.profilePublic}
                  onChange={(checked) => patchLocal({ profilePublic: checked })}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm font-medium text-foreground">Share statistics</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Controls whether your streak, habit count and average score
                    appear on the leaderboard.
                  </p>
                </div>
                <Switch
                  label="Share statistics"
                  description="Share aggregate stats such as streaks and average score."
                  checked={settings.shareStats}
                  onChange={(checked) => patchLocal({ shareStats: checked })}
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void persist()} isLoading={saving}>
                  Save privacy settings
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
        </div>
      </Card>

      <Card className="mt-6">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold">Your data</h2>
          </div>
          <ul className="mt-4 list-inside space-y-1 text-sm text-muted-foreground">
            <li>• Export everything at any time from Data → Export</li>
            <li>• Restore from a JSON backup at Data → Import</li>
            <li>• Delete your account permanently at Danger Zone</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
            <Link href="/settings/data" className="text-primary hover:underline">
              Data settings
            </Link>
            <Link href="/settings/export" className="text-primary hover:underline">
              Export my data
            </Link>
            <Link href="/settings/danger-zone" className="text-destructive hover:underline">
              Delete my account
            </Link>
          </div>
        </div>
      </Card>
    </main>
  );
}
