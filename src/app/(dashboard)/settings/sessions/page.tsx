'use client';

/**
 * Settings — Sessions
 * Lists active device sessions from GET /api/auth/sessions and revokes them
 * via DELETE /api/auth/sessions { sessionId }.
 */

import { useCallback, useEffect, useState } from 'react';
import { Laptop, LogOut, ShieldAlert, Trash2 } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { getRelativeTime } from '@/lib/utils';

interface DeviceSessionInfo {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  location: string | null;
  lastActiveAt: string;
  isCurrent: boolean;
}

export default function SessionsSettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [sessions, setSessions] = useState<DeviceSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await apiRequest<DeviceSessionInfo[]>('/api/auth/sessions'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    setNotice(null);
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

  const columns: readonly DataTableColumn<DeviceSessionInfo>[] = [
    {
      key: 'deviceName',
      header: 'Device',
      accessor: (row) => row.deviceName ?? row.deviceType ?? '',
      sortable: true,
      render: (row) => (
        <span className="flex items-center gap-2">
          <Laptop className="h-4 w-4 text-gray-400" />
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
          disabled={revokingId === row.id || row.isCurrent}
          isLoading={revokingId === row.id}
          title={row.isCurrent ? 'Current session cannot be revoked here' : undefined}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Revoke
        </Button>
      ),
    },
  ];

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Devices currently signed in to your account.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          <LogOut className="h-4 w-4" />
          {notice}
        </div>
      )}

      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold">Active sessions</h2>
        </div>
        <div className="p-6">
          <DataTable
            data={sessions}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No active sessions"
            emptyDescription="Sessions appear here when you sign in from another device."
          />
        </div>
      </Card>
    </main>
  );
}