import type { Metadata } from 'next';
import { Settings2 } from 'lucide-react';
import { SettingsDirectory } from '@/components/settings/SettingsDirectory';
import { SETTINGS_GROUPS, countSettingsDestinations } from '@/lib/settings/manifest';
import { privateMetadata } from '@/lib/seo';

/**
 * `/settings` — the directory index.
 *
 * The page itself is a Server Component that fetches nothing and mutates
 * nothing; it resolves a title, renders a header, and hands the static manifest
 * to the one client island that filters it. All 22 destination links are still
 * in the server-rendered HTML — the island is prerendered with them — so this
 * stayed a fast navigation hub rather than becoming a dashboard.
 *
 * Scope note: this page only *links* to the nested settings routes. It does not
 * read `UserSettings`, display current preference values, or own any of the
 * forms those pages render. Adding a "needs attention" badge here would have
 * meant depending on every child page's data shape, and the widget preferences
 * in particular live per-device in `localStorage`, not in the settings row.
 */
export const metadata: Metadata = privateMetadata(
  'Settings · RoutineOS',
  'Every RoutineOS setting in one place: preferences, account, integrations, billing and data.'
);

export default function SettingsHubPage() {
  const totalCount = countSettingsDestinations();

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div className="flex items-start gap-3">
        <div className="glass-panel glow-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-xl p-3">
          <Settings2 className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your account and preferences.
          </p>
        </div>
      </div>

      <SettingsDirectory groups={SETTINGS_GROUPS} totalCount={totalCount} />
    </div>
  );
}