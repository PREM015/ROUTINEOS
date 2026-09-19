/**
 * PWA install helpers.
 * Service worker registration and install-promotion handling. All functions
 * are no-ops that resolve to safe values when running outside the browser.
 */

const isClient = typeof window !== 'undefined';

let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Whether the current environment can register a service worker.
 */
export function isInstallable(): boolean {
  return isClient && 'serviceWorker' in navigator;
}

/**
 * Register the app's service worker. Resolves `null` when unsupported.
 */
export async function registerServiceWorker(
  swPath: string = '/sw.js',
  scope: string = '/'
): Promise<ServiceWorkerRegistration | null> {
  if (!isInstallable()) return null;
  return navigator.serviceWorker.register(swPath, { scope });
}

/**
 * Unregister any registered service worker.
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isInstallable()) return false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map(registration => registration.unregister())
  );
  return true;
}

/**
 * Whether the app is running as a standalone PWA (installed or launched from
 * the home screen).
 */
export function isStandalone(): boolean {
  if (!isClient) return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Capture the `beforeinstallprompt` event so the install dialog can be shown
 * later. Returns whether a prompt is now available.
 */
export function captureInstallPrompt(event: Event): boolean {
  deferredPrompt = event as BeforeInstallPromptEvent;
  return deferredPrompt !== null;
}

/**
 * Whether an install prompt has been captured and not yet dismissed.
 */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * Trigger the captured install prompt. Resolves `true` when the user accepts.
 */
export async function promptInstall(): Promise<boolean> {
  if (!canInstall() || !deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === 'accepted';
}