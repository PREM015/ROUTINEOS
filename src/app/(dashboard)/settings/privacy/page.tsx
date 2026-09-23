'use client';

/**
 * Settings — Privacy
 * Profile visibility and data-sharing toggles. Reads current values from
 * GET /api/users/[id]/settings and writes them via PUT /api/settings.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, ShieldAlert, Share2 } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';

interface PrivacySettingsRow {
  profilePublic: boolean;
  shareStats: boolean;
}

export default function PrivacySettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const [settings, setSettings] = useState<PrivacySettingsRow>({
    profilePublic: false,
    shareStats: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- inferred deps differ from source deps
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<PrivacySettingsRow>(`/api/users/${user.id}/settings`);
      setSettings({
        profilePublic: data.profilePublic ?? false,
        shareStats: data.shareStats ?? false,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load privacy settings.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: {
          profilePublic: settings.profilePublic,
          shareStats: settings.shareStats,
        },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save privacy settings.');
    } finally {
      setSaving(false);
    }
  };

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

  if (!isAuthenticated || !user) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
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
        <h1 className="text-2xl font-bold">Privacy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control who can see your profile and stats.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {loadError}
        </div>
      )}

      <Card>
        <div className="p-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Public profile</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Allow others to view your profile page and bio.
                  </p>
                </div>
                <Switch
                  checked={settings.profilePublic}
                  onChange={(checked) => setSettings({ ...settings, profilePublic: checked })}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Share statistics</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Share aggregate stats such as streaks and average score.
                  </p>
                </div>
                <Switch
                  checked={settings.shareStats}
                  onChange={(checked) => setSettings({ ...settings, shareStats: checked })}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => void save()} isLoading={saving} disabled={loading}>
              Save changes
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}