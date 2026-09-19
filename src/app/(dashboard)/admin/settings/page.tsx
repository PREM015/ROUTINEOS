'use client';

/**
 * Admin Settings
 * Lightweight admin preferences persisted in localStorage (site name,
 * maintenance mode and signups). The "Refresh state" button reflects the
 * current effective feature-flag values via GET /api/feature-flags/check,
 * so admins can confirm what users actually see.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldAlert, ShieldX } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

const STORAGE_KEY = 'routineos.admin.settings';

interface AdminPrefs {
  siteName: string;
  maintenanceMode: boolean;
  signupsEnabled: boolean;
}

const DEFAULT_PREFS: AdminPrefs = {
  siteName: 'RoutineOS',
  maintenanceMode: false,
  signupsEnabled: true,
};

const MAINTENANCE_KEY = 'maintenance-mode';
const SIGNUPS_KEY = 'signups-enabled';

function loadPrefs(): AdminPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<AdminPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function AdminSettingsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [prefs, setPrefs] = useState<AdminPrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [remote, setRemote] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const persist = (next: AdminPrefs) => {
    setPrefs(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const refreshState = async () => {
    setRefreshing(true);
    setRefreshError(null);
    const checks: Array<[string, string]> = [
      [MAINTENANCE_KEY, 'maintenanceMode'],
      [SIGNUPS_KEY, 'signupsEnabled'],
    ];
    const next: Record<string, boolean> = {};
    for (const [key] of checks) {
      try {
        const result = await apiRequest<{ enabled: boolean }>('/api/feature-flags/check', {
          query: { key },
        });
        next[key] = result.enabled;
      } catch {
        // Unknown flag keys are treated as unavailable/disabled.
        next[key] = false;
      }
    }
    setRemote(next);
    setRefreshing(false);
  };

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
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
              className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldX className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-xl font-bold">Access denied</h1>
            <p className="mt-2 text-sm text-gray-600">
              You need administrator privileges to view this page.
            </p>
          </div>
        </Card>
      </main>
    );
  }

  const remoteValue = (key: string): boolean | undefined =>
    Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : undefined;

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Admin Settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Platform preferences. Toggles here mirror feature-flag lookups; flag
          creation/updates happen on the Feature Flags page.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-bold">General</h2>
            <div className="mt-4 space-y-4">
              <Input
                label="Site name"
                value={prefs.siteName}
                onChange={(event) => persist({ ...prefs, siteName: event.target.value })}
                helperText="Displayed in headers and emails."
              />
              <Switch
                checked={prefs.maintenanceMode}
                onChange={(checked) => persist({ ...prefs, maintenanceMode: checked })}
                label="Maintenance mode"
              />
              <Switch
                checked={prefs.signupsEnabled}
                onChange={(checked) => persist({ ...prefs, signupsEnabled: checked })}
                label="Allow new signups"
              />
            </div>
            <div className="mt-4 flex items-center gap-3">
              {saved && (
                <span className="inline-flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
              <Button variant="outline" size="sm" onClick={refreshState} disabled={refreshing} isLoading={refreshing}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh feature-flag state
              </Button>
            </div>
            {refreshError && (
              <div className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {refreshError}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h2 className="text-lg font-bold">Current feature-flag state</h2>
            <p className="mt-1 text-sm text-gray-600">
              Values returned by GET /api/feature-flags/check for the known keys.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Badge variant={remoteValue(MAINTENANCE_KEY) === true ? 'warning' : 'success'}>
                {MAINTENANCE_KEY}: {remoteValue(MAINTENANCE_KEY) === undefined ? 'not configured' : remoteValue(MAINTENANCE_KEY) ? 'on' : 'off'}
              </Badge>
              <Badge variant={remoteValue(SIGNUPS_KEY) === true ? 'success' : 'warning'}>
                {SIGNUPS_KEY}: {remoteValue(SIGNUPS_KEY) === undefined ? 'not configured' : remoteValue(SIGNUPS_KEY) ? 'on' : 'off'}
              </Badge>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}