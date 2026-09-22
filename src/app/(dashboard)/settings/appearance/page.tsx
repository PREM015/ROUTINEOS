'use client';

import { ThemeToggle } from '@/components/layout/ThemeToggle';

export default function AppearanceSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Appearance</h1>
        <p className="text-muted-foreground mt-2">Customize how RoutineOS looks. Your choice is saved automatically.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div>
          <h3 className="font-medium mb-3 text-foreground">Theme</h3>
          <ThemeToggle variant="segmented" />
          <p className="mt-3 text-sm text-muted-foreground">
            System follows your device setting and updates automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
