import type { Metadata } from 'next';
import { FocusSettingsClient } from './FocusSettingsClient';

/**
 * /settings/focus
 *
 * A thin server shell. The page itself is a client component because every control
 * writes through `PUT /api/focus/settings` and needs the loaded row before it can
 * render a value; there is no server data to await that the client does not fetch
 * anyway.
 */
export const metadata: Metadata = {
  title: 'Focus Settings',
  description: 'Timer lengths, goals, reflection and sound for the focus timer',
};

export default function FocusSettingsPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Focus</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How your focus blocks are timed and what they count toward.
        </p>
      </header>

      <FocusSettingsClient />
    </main>
  );
}