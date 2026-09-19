"use client";

/**
 * IntegrationSettings — a dialog to manage an existing integration: activate /
 * deactivate the connection, provide/refresh an API key for API-key providers,
 * adjust the sync frequency (persisted locally — the API has no frequency
 * field), and disconnect with a confirmation step.
 *
 * Uses:
 *   GET  /api/integrations                 — find the connection
 *   PATCH /api/integrations/[provider]      — toggle isActive / set accessToken
 *   POST /api/integrations/[provider]/disconnect — remove the connection
 *
 * Usage:
 *   <IntegrationSettings provider={provider} open={open}
 *     onOpenChange={setOpen} onSaved={refreshCards} />
 */
import * as React from 'react';
import type { IntegrationProvider } from '@prisma/client';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Button, Input, Select, Switch, Spinner } from '@/components/ui';
import Dialog from '@/components/ui/Dialog';
import { ConnectedIntegration } from './IntegrationCard';

export interface IntegrationSettingsProps {
  provider: IntegrationProvider;
  providerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const FREQUENCY_KEY = 'routineos:integration-sync-frequency';

export interface FrequencyOption {
  value: string;
  label: string;
}

export const SYNC_FREQUENCIES: readonly FrequencyOption[] = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'realtime', label: 'Real time' },
];

function providerSlug(provider: IntegrationProvider): string {
  return provider.toLowerCase().replace(/_/g, '-');
}

function readLocalFrequency(): string {
  if (typeof window === 'undefined') return 'manual';
  return window.localStorage.getItem(FREQUENCY_KEY) ?? 'manual';
}

export default function IntegrationSettings({
  provider,
  providerName,
  open,
  onOpenChange,
  onSaved,
}: IntegrationSettingsProps) {
  const [connection, setConnection] = React.useState<ConnectedIntegration | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [active, setActive] = React.useState(true);
  const [frequency, setFrequency] = React.useState<string>(() => readLocalFrequency());
  const [apiKey, setApiKey] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await apiRequest<ConnectedIntegration[]>('/api/integrations');
      const found = all.find((item) => item.provider === provider) ?? null;
      setConnection(found);
      setActive(found?.isActive === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integration');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      setConfirmingDisconnect(false);
      setError(null);
      setMessage(null);
      void load();
    }
  }, [open, provider]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const body: Record<string, unknown> = { isActive: active };
    if (apiKey.trim().length > 0) {
      body.accessToken = apiKey.trim();
    }
    try {
      await apiRequest(`/api/integrations/${providerSlug(provider)}`, { method: 'PATCH', body });
      window.localStorage.setItem(FREQUENCY_KEY, frequency);
      setApiKey('');
      setMessage('Settings saved');
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setError(null);
    try {
      await apiRequest(`/api/integrations/${providerSlug(provider)}/disconnect`, {
        method: 'POST',
      });
      window.localStorage.removeItem(FREQUENCY_KEY);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${providerName} settings`}
      description="Manage this integration's connection and sync behavior."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => void save()} isLoading={saving}>
            Save settings
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6" />
        </div>
      ) : connection ? (
        <div className="space-y-5">
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm text-green-600" aria-live="polite">
              {message}
            </p>
          )}

          <Switch
            label="Connection active"
            checked={active}
            onChange={setActive}
          />

          <Select
            label="Sync frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            options={[...SYNC_FREQUENCIES]}
          />

          <Input
            label="API key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste a new API key to rotate it"
            icon={<KeyRound className="h-4 w-4" />}
          />

          {connection.lastSyncedAt && (
            <p className="text-xs text-gray-500">
              Last synced: {new Date(connection.lastSyncedAt).toLocaleString()}
            </p>
          )}

          <div className="rounded-lg bg-red-50 p-3">
            {confirmingDisconnect ? (
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
                <p className="flex-1 text-sm text-red-700">
                  Disconnect {providerName}? Synced items stay, but syncing stops.
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void disconnect()}
                  isLoading={disconnecting}
                >
                  Disconnect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={disconnecting}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-100 hover:text-red-700"
                onClick={() => setConfirmingDisconnect(true)}
              >
                Disconnect {providerName}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          This integration is not connected yet. Connect it first before managing settings.
        </p>
      )}
    </Dialog>
  );
}