'use client';

/**
 * Settings — API Keys
 * Lists keys from GET /api/api-keys, creates keys via POST /api/api-keys and
 * revokes them via POST /api/api-keys/[id]/revoke. The raw key is displayed
 * exactly once, immediately after creation.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Key, ShieldAlert, Trash2 } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

interface ApiKeyRow {
  id: string;
  name: string;
  description: string | null;
  maskedKey: string;
  isActive: boolean;
  scopes: string | null;
  rateLimit: number | null;
  usageCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  key?: string;
}

export default function ApiKeysSettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await apiRequest<ApiKeyRow[]>('/api/api-keys'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys.');
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const create = async () => {
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await apiRequest<ApiKeyRow>('/api/api-keys', {
        method: 'POST',
        body: { name: name.trim(), description: description.trim() || undefined },
      });
      setCreatedKey(created);
      setName('');
      setDescription('');
      void loadKeys();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create API key.');
    } finally {
      setCreating(false);
    }
  };

  const copyKey = async () => {
    if (!createdKey?.key) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice('Copy failed — select the key manually.');
    }
  };

  const revoke = async (id: string) => {
    setRevokingId(id);
    setNotice(null);
    try {
      await apiRequest(`/api/api-keys/${id}/revoke`, { method: 'POST' });
      setNotice('API key revoked.');
      void loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key.');
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
          <Skeleton className="h-40 rounded-xl" />
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

  const columns: readonly DataTableColumn<ApiKeyRow>[] = [
    {
      key: 'name',
      header: 'Name',
      accessor: (row) => row.name,
      sortable: true,
    },
    {
      key: 'maskedKey',
      header: 'Key',
      accessor: (row) => row.maskedKey,
      className: 'font-mono text-xs',
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => (row.isActive ? 'active' : 'revoked'),
      sortable: true,
      render: (row) => (
        <Badge variant={row.isActive ? 'success' : 'default'}>
          {row.isActive ? 'Active' : 'Revoked'}
        </Badge>
      ),
    },
    {
      key: 'usage',
      header: 'Usage',
      accessor: (row) => row.usageCount,
      sortable: true,
      render: (row) => <span>{row.usageCount.toLocaleString()}</span>,
    },
    {
      key: 'lastUsedAt',
      header: 'Last used',
      accessor: (row) => (row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : ''),
      sortable: true,
      render: (row) => (
        <span>
          {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.isActive ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => void revoke(row.id)}
            disabled={revokingId === row.id}
            isLoading={revokingId === row.id}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="mt-1 text-sm text-gray-600">
          Generate keys for the public API. The raw key is shown only once.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          {notice}
        </div>
      )}

      {createdKey?.key && (
        <Card className="mb-6 border-green-200 bg-green-50/70">
          <div className="p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <h2 className="text-sm font-semibold text-green-800">
                Key created — copy it now
              </h2>
            </div>
            <p className="mt-2 font-mono text-sm">{createdKey.key}</p>
            <p className="mt-1 text-xs text-green-700">
              For security, this value will not be shown again.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void copyKey()}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              {copied ? 'Copied' : 'Copy key'}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold">Your keys</h2>
        </div>
        <div className="p-6">
          <DataTable
            data={keys}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No API keys"
            emptyDescription="Create a key below to get started."
          />
        </div>
      </Card>

      <Card className="mt-6">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold">Create key</h2>
        </div>
        <div className="space-y-4 p-6">
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Production dashboard"
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="What will this key be used for?"
          />
          <Button
            onClick={() => void create()}
            isLoading={creating}
            disabled={name.trim().length === 0}
          >
            <Key className="mr-2 h-4 w-4" />
            Create key
          </Button>
        </div>
      </Card>
    </main>
  );
}