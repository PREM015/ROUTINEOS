'use client';

/**
 * Settings — Sessions
 *
 * Lists device sessions from `GET /api/auth/sessions?deviceId=<id>` and revokes
 * them via `DELETE /api/auth/sessions { sessionId }`, or all of them at once
 * via `POST /api/auth/logout-all`.
 *
 * The `deviceId` query parameter is this browser's localStorage fingerprint
 * (see `components/auth/DeviceSessionTracker.tsx`). It is what marks a row
 * "This device" — previously the server inferred that from `lastActiveAt` and
 * flagged every device used in the last 30 minutes, which disabled Revoke on
 * all of them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Laptop, LogOut, ShieldAlert, Trash2 } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import { useSettingsStore } from '@/store/settings.store';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { getRelativeTime } from '@/lib/utils';

const DEVICE_ID_KEY = 'routineos.device.id';

interface DeviceSessionInfo {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  location: string | null;
  lastActiveAt: string;
  isCurrent: boolean;
}

function readDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

export default function SessionsSettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [sessions, setSessions] = useState<DeviceSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const load = useCallback(async () => {
    // Guarded: an unauthenticated visit used to fire a guaranteed-401 fetch.
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const deviceId = readDeviceId();
      const data = await apiRequest<DeviceSessionInfo[]>(
        '/api/auth/sessions',
        deviceId ? { query: { deviceId } } : undefined
      );
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const revoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    setNotice(null);
    setError(null);
    try {
      await apiRequest('/api/auth/sessions', {
        method: 'DELETE',
        body: { sessionId },
      });
      setNotice('Session revoked.');
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke session.');
    } finally {
      setRevokingId(null);
    }
  };

  const signOutEverywhere = async () => {
    setSigningOutAll(true);
    setNotice(null);
    setError(null);
    try {
      await apiRequest('/api/auth/logout-all', { method: 'POST' });
      // The current device is signed out too, so drop local caches before the
      // redirect — otherwise the next account could read them.
      useSettingsStore.getState().reset();
      useAuthStore.getState().reset();
      router.push('/login');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to sign out all sessions.'
      );
      setSigningOutAll(false);
    }
  };

  const columns = useMemo<readonly DataTableColumn<DeviceSessionInfo>[]>(
    () => [
      {
        key: 'deviceName',
        header: 'Device',
        accessor: (row) => row.deviceName ?? row.deviceType ?? '',
        sortable: true,
        render: (row) => (
          <span className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
            {row.deviceName ?? row.deviceType ?? 'Unknown device'}
            {row.isCurrent && <Badge variant="primary">This device</Badge>}
          </span>
        ),
      },
      {
        key: 'location',
        header: 'Location',
        accessor: (row) => row.location ?? '',
        sortable: true,
        render: (row) => (
          <span>
            {row.location ?? 'Unknown location'}
            {row.ipAddress ? ` (${row.ipAddress})` : ''}
          </span>
        ),
      },
      {
        key: 'lastActiveAt',
        header: 'Last active',
        accessor: (row) => new Date(row.lastActiveAt).toISOString(),
        sortable: true,
        render: (row) => <span>{getRelativeTime(row.lastActiveAt)}</span>,
      },
      {
        key: 'actions',
        header: '',
        render: (row) => (
          <Button
            variant="danger"
            size="sm"
            onClick={() => void revoke(row.id)}
            disabled={revokingId === row.id}
            isLoading={revokingId === row.id}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Revoke
          </Button>
        ),
      },
    ],
    [revokingId]
  );

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-4xl px-4 py-8">
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

  const otherSessions = sessions.filter((row) => !row.isCurrent).length;

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Devices currently signed in to your account.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400" role="status">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {notice}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">Active sessions</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void signOutEverywhere()}
            disabled={signingOutAll || sessions.length === 0}
            isLoading={signingOutAll}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Sign out everywhere
          </Button>
        </div>
        <div className="p-6">
          <DataTable
            data={sessions}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No active sessions"
            emptyDescription="Sessions appear here once you sign in from this or another device. This browser may need a reload to register."
          />
        </div>
        <div className="border-t border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">
            {otherSessions > 0
              ? `${otherSessions} other device${otherSessions === 1 ? '' : 's'} signed in.`
              : 'You are the only signed-in device.'}{' '}
            “Sign out everywhere” also invalidates this device and every other
            one, including sessions on this browser.
          </p>
        </div>
      </Card>
    </main>
  );
}
