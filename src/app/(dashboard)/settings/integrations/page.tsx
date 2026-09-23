'use client';

/**
 * Settings — Integrations
 * Lists the user's connections from GET /api/integrations (provider
 * normalized into an IntegrationSafeView + providerName) and disconnects a
 * provider via POST /api/integrations/[provider]/disconnect. Enabled providers
 * without a connection show the OAuth connect flow hint.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link2, ShieldAlert, Unplug } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { getEnabledIntegrations } from '@/lib/constants/integrations';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface IntegrationRow {
  id: string;
  provider: string;
  providerName: string;
  isActive: boolean;
  scopes: string[];
  lastSyncedAt: string | null;
  syncError: string | null;
  connectedAt: string;
  expiresAt: string | null;
  needsReauth: boolean;
}

function providerSlug(provider: string): string {
  return provider.toLowerCase().replace(/_/g, '-');
}

export default function IntegrationsSettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setIntegrations(await apiRequest<IntegrationRow[]>('/api/integrations'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations.');
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const disconnect = async (row: IntegrationRow) => {
    setDisconnecting(row.provider);
    setNotice(null);
    try {
      await apiRequest(`/api/integrations/${providerSlug(row.provider)}/disconnect`, {
        method: 'POST',
      });
      setNotice(`${row.providerName} disconnected.`);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to disconnect ${row.providerName}.`);
    } finally {
      setDisconnecting(null);
    }
  };

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-48" />
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

  const availableProviderNames = new Set(
    getEnabledIntegrations().map((config) => config.provider)
  );

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external services to sync data both ways.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400" role="status">
          {notice}
        </div>
      )}

      <Card>
        <div className="flex items-center gap-2 border-b border-border px-6 py-4">
          <Link2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Connected services</h2>
        </div>

        {loading ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-2/3" />
          </div>
        ) : integrations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No integrations connected yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {integrations.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{row.providerName}</span>
                    <Badge variant={row.isActive ? 'success' : 'default'}>
                      {row.isActive ? (row.needsReauth ? 'Needs reauth' : 'Active') : 'Disconnected'}
                    </Badge>
                    {row.syncError && <Badge variant="danger">Sync error</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Connected {new Date(row.connectedAt).toLocaleDateString()}
                    {row.lastSyncedAt
                      ? ` · last synced ${new Date(row.lastSyncedAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.scopes.length > 0 && (
                    <span className="hidden text-xs text-muted-foreground/60 sm:inline">
                      {row.scopes.length} scope{row.scopes.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {row.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void disconnect(row)}
                      disabled={disconnecting === row.provider}
                      isLoading={disconnecting === row.provider}
                    >
                      <Unplug className="mr-1.5 h-3.5 w-3.5" />
                      Disconnect
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {availableProviderNames.size > 0 && (
        <Card className="mt-6">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-bold">Available providers</h2>
          </div>
          <ul className="divide-y divide-border">
            {getEnabledIntegrations().map((config) => {
              const connected = integrations.some(
                (row) => row.provider === config.provider && row.isActive
              );
              return (
                <li key={config.provider} className="flex items-center justify-between gap-3 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl" aria-hidden="true">{config.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{config.name}</p>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                  <Badge variant={connected ? 'success' : 'primary'}>
                    {connected ? 'Connected' : config.authType === 'oauth' ? 'OAuth setup' : 'API key setup'}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border px-6 py-4">
            <p className="text-xs text-muted-foreground">
              New connections use POST /api/integrations; OAuth providers
              require the environment to be configured with OAuth credentials.
            </p>
          </div>
        </Card>
      )}
    </main>
  );
}