'use client';

import { useState } from 'react';
import type { IntegrationProvider } from '@prisma/client';
import { Plug } from 'lucide-react';
import { getEnabledIntegrations } from '@/lib/constants/integrations';
import IntegrationCard from '@/components/integrations/IntegrationCard';
import IntegrationSettings from '@/components/integrations/IntegrationSettings';

/**
 * Integrations Page
 * Connect and manage third-party integrations. Each card owns its own
 * connection state; the page coordinates the shared settings dialog.
 */
export default function IntegrationsPage() {
  const integrations = getEnabledIntegrations();
  const [settingsProvider, setSettingsProvider] = useState<IntegrationProvider | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeConfig = integrations.find((item) => item.provider === settingsProvider) ?? null;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Plug className="h-7 w-7 text-blue-600" />
          Integrations
        </h1>
        <p className="mt-2 text-gray-600">
          Connect the tools you already use to sync calendars, tasks, health data and more.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => (
          <IntegrationCard
            key={`${integration.provider}-${refreshKey}`}
            provider={integration.provider}
            name={integration.name}
            description={integration.description}
            icon={integration.icon}
            authType={integration.authType}
            onOpenSettings={setSettingsProvider}
          />
        ))}
      </div>

      {activeConfig && (
        <IntegrationSettings
          provider={activeConfig.provider}
          providerName={activeConfig.name}
          open={settingsProvider !== null}
          onOpenChange={(open) => {
            if (!open) setSettingsProvider(null);
          }}
          onSaved={() => setRefreshKey((value) => value + 1)}
        />
      )}
    </div>
  );
}
