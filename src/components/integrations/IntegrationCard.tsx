"use client";

/**
 * IntegrationCard — a provider card showing the integration's name,
 * description, icon, connection status, and a sync action. Connection state is
 * loaded from GET /api/integrations; connecting posts POST /api/integrations
 * (OAuth providers respond with an authorization URL that the card opens);
 * disconnecting posts POST /api/integrations/[provider]/disconnect; syncing
 * posts POST /api/integrations/[provider]/sync.
 *
 * Usage:
 *   <IntegrationCard provider="GOOGLE_CALENDAR" name="Google Calendar"
 *     description="Two-way sync" icon="📅" authType="oauth"
 *     onOpenSettings={(p) => setSettingsProvider(p)} />
 */
import * as React from 'react';
import type { IntegrationProvider } from '@prisma/client';
import { CheckCircle2, Link, RefreshCw, Settings, Unplug } from 'lucide-react';
import type { IntegrationSafeView } from '@/types/integrations';
import { apiRequest } from '@/lib/api-client';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface ConnectedIntegration extends IntegrationSafeView {
  providerName: string;
}

export interface IntegrationCardProps {
  provider: IntegrationProvider;
  name: string;
  description: string;
  icon: string;
  authType: 'oauth' | 'apikey';
  /** Called when the user opens this provider's settings dialog. */
  onOpenSettings?: (provider: IntegrationProvider) => void;
  className?: string;
}

function providerSlug(provider: IntegrationProvider): string {
  return provider.toLowerCase().replace(/_/g, '-');
}

export default function IntegrationCard({
  provider,
  name,
  description,
  icon,
  authType,
  onOpenSettings,
  className,
}: IntegrationCardProps) {
  const [connection, setConnection] = React.useState<ConnectedIntegration | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await apiRequest<ConnectedIntegration[]>('/api/integrations');
        if (!cancelled) {
          setConnection(all.find((item) => item.provider === provider) ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load integrations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await apiRequest<{ requiresRedirect?: boolean; authorizationUrl?: string }>(
        '/api/integrations',
        { method: 'POST', body: { provider } },
      );
      if (result.requiresRedirect && result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setMessage('Connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to this provider.');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setMessage(null);
    setError(null);
    try {
      await apiRequest<{ success?: boolean }>(`/api/integrations/${providerSlug(provider)}/disconnect`, {
        method: 'POST',
      });
      setConnection(null);
      setMessage('Disconnected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const sync = async () => {
    if (syncing || !connection?.isActive) return;
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const result = await apiRequest<{ message?: string; synced?: number }>(
        `/api/integrations/${providerSlug(provider)}/sync`,
        { method: 'POST' },
      );
      const count = result.synced ?? 0;
      setMessage(result.message ?? `Synced — ${count} item${count === 1 ? '' : 's'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const connected = connection?.isActive === true;

  if (loading && !connection) {
    return (
      <Card className={cn('flex h-full items-center justify-center p-8', className)}>
        <Spinner className="h-6 w-6" />
      </Card>
    );
  }

  return (
    <Card className={cn('flex h-full flex-col p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-xl" aria-hidden="true">
            {icon}
          </span>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{name}</h3>
            {connected ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="default">Not connected</Badge>
            )}
          </div>
        </div>
        <Badge variant="primary">{authType === 'oauth' ? 'OAuth' : 'API key'}</Badge>
      </div>

      <p className="mt-3 flex-1 text-sm text-gray-500">{description}</p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-3 text-sm text-green-600" aria-live="polite">
          {message}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            <Button variant="outline" size="sm" onClick={() => void sync()} isLoading={syncing}>
              {!syncing && <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Sync
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void disconnect()} isLoading={disconnecting}>
              {!disconnecting && <Unplug className="mr-1.5 h-3.5 w-3.5" />}
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void connect()} isLoading={connecting}>
            {!connecting && <Link className="mr-1.5 h-3.5 w-3.5" />}
            Connect
          </Button>
        )}
        {connected && onOpenSettings && (
          <Button variant="ghost" size="sm" onClick={() => onOpenSettings(provider)}>
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Settings
          </Button>
        )}
      </div>
    </Card>
  );
}