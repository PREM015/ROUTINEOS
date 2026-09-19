"use client";

/**
 * InstallPrompt — a dismissible banner that invites the user to install the
 * app as a PWA using the browser's `beforeinstallprompt` event. Dismissal is
 * remembered in localStorage so the prompt does not nag every visit.
 *
 * Usage:
 *   <InstallPrompt />
 */
import * as React from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'routineos:install-prompt-dismissed';

export interface InstallPromptProps {
  className?: string;
}

export default function InstallPrompt({ className }: InstallPromptProps) {
  const [installEvent, setInstallEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  });

  React.useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed || !installEvent) return null;

  const install = async () => {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallEvent(null);
        window.localStorage.setItem(DISMISS_KEY, '1');
      }
    } finally {
      setInstalling(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    window.localStorage.setItem(DISMISS_KEY, '1');
  };

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm ${className ?? ''}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white" aria-hidden="true">
          <Download className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-blue-900">Install RoutineOS</p>
          <p className="text-xs text-blue-700">Add the app to your home screen for quick access and offline support.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void install()} isLoading={installing}>
          Install
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}