'use client';

/**
 * Admin Feature Flags
 * Lists flags from GET /api/admin/feature-flags, creates new flags via
 * POST /api/admin/feature-flags and enables disable/update toggles for each
 * flag. The admin API only exposes a create endpoint, so toggling an existing
 * flag attempts a create with the toggled state; a 409 "already exists"
 * conflict surfaces a notice instead of silently failing.
 */

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, ShieldX, Plus } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

interface FeatureFlagRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  rolloutPercent: number;
  enabledForUsers?: string | null;
  enabledForRoles?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateFlagForm {
  key: string;
  name: string;
  description: string;
  isEnabled: boolean;
  rolloutPercent: number;
}

const EMPTY_FORM: CreateFlagForm = {
  key: '',
  name: '',
  description: '',
  isEnabled: true,
  rolloutPercent: 100,
};

export default function AdminFeatureFlagsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateFlagForm>(EMPTY_FORM);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFlags(await apiRequest<FeatureFlagRow[]>('/api/admin/feature-flags'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feature flags.');
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void loadFlags();
  }, [loadFlags]);

  const toggleFlag = async (flag: FeatureFlagRow) => {
    setUpdatingKey(flag.key);
    setNotice(null);
    try {
      await apiRequest('/api/admin/feature-flags', {
        method: 'POST',
        body: {
          key: flag.key,
          name: flag.name,
          description: flag.description ?? undefined,
          isEnabled: !flag.isEnabled,
          rolloutPercent: flag.rolloutPercent,
        },
      });
      setNotice(`Flag "${flag.key}" updated.`);
      void loadFlags();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNotice(
          `Flag "${flag.key}" already exists. The admin API currently only supports creating flags, so in-place toggle updates are not available.`
        );
      } else {
        setNotice(err instanceof Error ? err.message : 'Failed to toggle the flag.');
      }
    } finally {
      setUpdatingKey(null);
    }
  };

  const createFlag = async () => {
    setCreating(true);
    setNotice(null);
    setError(null);
    try {
      await apiRequest('/api/admin/feature-flags', {
        method: 'POST',
        body: {
          key: form.key.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isEnabled: form.isEnabled,
          rolloutPercent: form.rolloutPercent,
        },
      });
      setNotice(`Flag "${form.key.trim()}" created.`);
      setForm(EMPTY_FORM);
      void loadFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the flag.');
    } finally {
      setCreating(false);
    }
  };

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
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

  if (user.role !== 'ADMIN') {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldX className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">Access denied</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You need administrator privileges to view this page.
            </p>
          </div>
        </Card>
      </main>
    );
  }

  const columns: readonly DataTableColumn<FeatureFlagRow>[] = [
    {
      key: 'key',
      header: 'Key',
      accessor: (row) => row.key,
      sortable: true,
      className: 'font-mono text-xs',
    },
    {
      key: 'name',
      header: 'Name',
      accessor: (row) => row.name,
      sortable: true,
    },
    {
      key: 'description',
      header: 'Description',
      accessor: (row) => row.description ?? '',
    },
    {
      key: 'isEnabled',
      header: 'Status',
      accessor: (row) => (row.isEnabled ? 'enabled' : 'disabled'),
      sortable: true,
      render: (row) => (
        <Badge variant={row.isEnabled ? 'success' : 'default'}>
          {row.isEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'rolloutPercent',
      header: 'Rollout',
      accessor: (row) => `${row.rolloutPercent}%`,
      sortable: true,
    },
    {
      key: 'toggle',
      header: 'Toggle',
      render: (row) => (
        <Switch
          checked={row.isEnabled}
          onChange={() => void toggleFlag(row)}
          label={updatingKey === row.key ? 'Saving…' : undefined}
        />
      ),
    },
  ];

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage platform-wide feature switches.
        </p>
      </div>

      {notice && (
        <div className="mb-6 rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      <Card>
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">Existing flags</h2>
        </div>
        <div className="p-6">
          <DataTable
            data={flags}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No feature flags"
            emptyDescription="Create your first flag below."
          />
        </div>
      </Card>

      <Card className="mt-6">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">Create flag</h2>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Key"
              value={form.key}
              onChange={(event) => setForm({ ...form, key: event.target.value })}
              placeholder="e.g. beta-dashboard"
              helperText="URL-safe: lowercase letters, numbers, dashes."
            />
            <Input
              label="Name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Beta dashboard"
            />
          </div>
          <Textarea
            label="Description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={3}
            placeholder="What does this flag control?"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-end pb-2">
              <Switch checked={form.isEnabled} onChange={(checked) => setForm({ ...form, isEnabled: checked })} label="Enabled" />
            </div>
            <Input
              label="Rollout percent"
              type="number"
              min={0}
              max={100}
              value={form.rolloutPercent}
              onChange={(event) =>
                setForm({ ...form, rolloutPercent: Number(event.target.value) })
              }
            />
          </div>
          <Button
            onClick={() => void createFlag()}
            isLoading={creating}
            disabled={form.key.trim().length === 0 || form.name.trim().length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create flag
          </Button>
        </div>
      </Card>
    </main>
  );
}