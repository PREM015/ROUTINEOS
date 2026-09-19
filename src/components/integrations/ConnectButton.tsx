"use client";

/**
 * ConnectButton — a single connect action for an integration provider. For
 * OAuth providers it POSTs /api/integrations and redirects the user to the
 * returned authorization URL. For API-key providers it emits `onNeedApiKey` so
 * the parent can open a settings dialog to enter the token; without that
 * callback it POSTs directly.
 *
 * Usage:
 *   <ConnectButton provider="GOOGLE_CALENDAR" authType="oauth" />
 *   <ConnectButton provider="TRELLO" authType="apikey" onNeedApiKey={openKeyDialog} />
 */
import * as React from 'react';
import type { IntegrationProvider } from '@prisma/client';
import { Link } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui';

export interface ConnectButtonProps {
  provider: IntegrationProvider;
  authType: 'oauth' | 'apikey';
  /** Emitted when an API-key provider needs a token before it can connect. */
  onNeedApiKey?: (provider: IntegrationProvider) => void;
  /** Called after a successful connect (non-redirect flows only). */
  onConnected?: () => void;
  className?: string;
}

export default function ConnectButton({
  provider,
  authType,
  onNeedApiKey,
  onConnected,
  className,
}: ConnectButtonProps) {
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const connect = async () => {
    if (connecting) return;
    setError(null);

    if (authType === 'apikey' && onNeedApiKey) {
      onNeedApiKey(provider);
      return;
    }

    setConnecting(true);
    try {
      const result = await apiRequest<{ requiresRedirect?: boolean; authorizationUrl?: string }>(
        '/api/integrations',
        { method: 'POST', body: { provider } },
      );
      if (result.requiresRedirect && result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to this provider.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className={className}>
      <Button onClick={() => void connect()} isLoading={connecting} className="w-full">
        {!connecting && <Link className="mr-1.5 h-4 w-4" />}
        {authType === 'apikey' ? 'Enter API key' : 'Connect'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}