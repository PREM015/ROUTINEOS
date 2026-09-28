'use client';

/**
 * Settings — Integrations
 *
 * Lists the user's connections from GET /api/integrations (provider normalized
 * into an IntegrationSafeView + providerName), connects a provider via
 * POST /api/integrations, and disconnects one via
 * POST /api/integrations/[provider]/disconnect.
 *
 * Fixes vs. the previous version:
 *  - The "Available providers" list was read-only. Its footnote told the user to
 *    "use POST /api/integrations", an API the page never called, so there was no
 *    way to connect anything from the UI. OAuth providers now redirect to the
 *    provider's consent screen; API-key providers prompt for a token.
 *  - Disconnect always failed: the dynamic route read `params` synchronously,
 *    which is `undefined` on Next 15+ (`params` is a Promise), so the provider
 *    slug was never resolved. The route has been fixed.
 *  - An error from a failed disconnect was never cleared, so it persisted over
 *    a later successful one.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Link2, Plug, RefreshCw, ShieldAlert, Unplug } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { getEnabledIntegrations, type IntegrationConfig } from '@/lib/constants/integrations';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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

/** Shape returned by POST /api/integrations for an OAuth provider. */
interface ConnectRedirect {
  requiresRedirect: true;
  authorizationUrl: string;
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
  const [busy, setBusy] = useState<string | null>(null);
  /** Provider whose API-key form is open. */
  const [apiKeyFor, setApiKeyFor] = useState<string | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState('');

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
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
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Connect a provider.
   *
   * OAuth providers respond with an authorization URL that the user must visit;
   * the callback completes the connection. API-key providers need a token
   * supplied directly.
   */
  const connect = async (config: IntegrationConfig, accessToken?: string) => {
    setBusy(config.provider);
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<ConnectRedirect | IntegrationRow>(
        '/api/integrations',
        {
          method: 'POST',
          body: {
            provider: config.provider,
            ...(accessToken ? { accessToken } : {}),
          },
        }
      );

      if ('requiresRedirect' in result && result.authorizationUrl) {
        // Full navigation: the provider redirects back to our callback URL.
        window.location.assign(result.authorizationUrl);
        return;
      }

      setNotice(`${config.name} connected.`);
      setApiKeyFor(null);
      setApiKeyValue('');
      void load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Failed to connect ${config.name}.`
      );
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (row: IntegrationRow) => {
    setBusy(row.provider);
    setNotice(null);
    setError(null);
    try {
      await apiRequest(`/api/integrations/${providerSlug(row.provider)}/disconnect`, {
        method: 'POST',
      });
      setNotice(`${row.providerName} disconnected.`);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to disconnect ${row.providerName}.`);
    } finally {
      setBusy(null);
    }
  };

  const sync = async (row: IntegrationRow) => {
    setBusy(row.provider);
    setNotice(null);
    setError(null);
    try {
      await apiRequest(`/api/integrations/${providerSlug(row.provider)}/sync`, {
        method: 'POST',
      });
      setNotice(`${row.providerName} synced.`);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to sync ${row.providerName}.`);
    } finally {
      setBusy(null);
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

  const available = getEnabledIntegrations();

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
          <Link2 className="h-5 w-5 text-primary" aria-hidden="true" />
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
            No integrations connected yet. Connect one from the list below.
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
                <div className="flex flex-wrap items-center gap-2">
                  {row.scopes.length > 0 && (
                    <span className="hidden text-xs text-muted-foreground/60 sm:inline">
                      {row.scopes.length} scope{row.scopes.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {row.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void sync(row)}
                      disabled={busy === row.provider}
                      isLoading={busy === row.provider}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Sync now
                    </Button>
                  )}
                  {row.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void disconnect(row)}
                      disabled={busy === row.provider}
                      isLoading={busy === row.provider}
                    >
                      <Unplug className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Disconnect
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {available.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-bold">Available providers</h2>
          </div>
          <ul className="divide-y divide-border">
            {available.map((config) => {
              const connected = integrations.some(
                (row) => row.provider === config.provider && row.isActive
              );
              const isOpen = apiKeyFor === config.provider;
              return (
                <li key={config.provider} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl" aria-hidden="true">{config.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{config.name}</p>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={connected ? 'success' : 'default'}>
                        {connected
                          ? 'Connected'
                          : config.authType === 'oauth'
                            ? 'OAuth'
                            : 'API key'}
                      </Badge>
                      {!connected && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            config.authType === 'apikey'
                              ? setApiKeyFor(isOpen ? null : config.provider)
                              : void connect(config)
                          }
                          disabled={busy === config.provider}
                          isLoading={busy === config.provider}
                        >
                          {config.authType === 'apikey' ? (
                            <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Plug className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {config.authType === 'apikey' ? 'Enter API key' : 'Connect'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isOpen && !connected && (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <div className="min-w-64 flex-1">
                        <Input
                          label={`${config.name} API key`}
                          type="password"
                          value={apiKeyValue}
                          onChange={(event) => setApiKeyValue(event.target.value)}
                          placeholder="Paste your API key"
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void connect(config, apiKeyValue.trim())}
                        disabled={apiKeyValue.trim().length === 0 || busy === config.provider}
                        isLoading={busy === config.provider}
                      >
                        Save and connect
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setApiKeyFor(null);
                          setApiKeyValue('');
                        }}
                        disabled={busy === config.provider}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border px-6 py-4">
            <p className="text-xs text-muted-foreground">
              OAuth providers redirect you to the provider to grant access, then
              return here. A connection needs the matching OAuth credentials to
              be configured in the server environment.
            </p>
          </div>
        </Card>
      )}
    </main>
  );
}