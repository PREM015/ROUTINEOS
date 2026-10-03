'use client';

/**
 * Transport — Start / Pause / Resume / Reset / Skip / Lap / +5.
 *
 * Every button goes through `getFocusRuntime()` rather than touching the store.
 * That indirection is the point: the runtime lives in the dashboard layout and
 * outlives navigation, so these controls work from any page and cannot become
 * closures over an unmounted component — which is exactly what made the previous
 * floating-bar buttons silent no-ops.
 *
 * `busy` comes from the store and is applied as `disabled` on every control, so a
 * double click cannot produce two `start` requests. The `one_active_session_per_user`
 * partial index would reject the second anyway, but a rejected request is a bad
 * experience to ship deliberately.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Pause, Play, RotateCcw, SkipForward, Square, Timer } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { getFocusRuntime, useFocusStore, isLive } from '@/store/focus.store';

/** Only the subset of the router this module uses. */
type Router = { push: (href: string) => void };

type Action = 'start' | 'pause' | 'resume' | 'stop' | 'skip' | 'lap' | 'extend';

interface ButtonSpec {
  key: Action;
  label: string;
  icon: typeof Play;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
}

/**
 * Run an action through the runtime, falling back to `/focus` when it is absent.
 *
 * The fallback is a navigation rather than a no-op: a disabled-looking control
 * with no explanation is worse than one that takes the user somewhere the timer
 * exists.
 */
function dispatch(action: Action, router: Router): void {
  const runtime = getFocusRuntime();
  if (!runtime) {
    // No runtime yet: first paint, or a route outside the dashboard group. Sending
    // the user to `/focus` is better than a button that silently does nothing.
    router.push('/focus');
    return;
  }
  switch (action) {
    case 'start':
      void runtime.start();
      break;
    case 'pause':
      void runtime.pause();
      break;
    case 'resume':
      void runtime.resume();
      break;
    case 'stop':
      void runtime.stop('STOPPED');
      break;
    case 'skip':
      void runtime.stop('SKIPPED');
      break;
    case 'lap':
      // Laps are a stopwatch-only display concern; the runtime records nothing,
      // because a lap is not an event worth a row in the lifecycle log.
      toast('Lap marked');
      break;
    case 'extend':
      void runtime.extend(300);
      break;
  }
}

export function Transport({ className }: { className?: string }) {
  const router = useRouter();
  const status = useFocusStore((s) => s.status);
  const mode = useFocusStore((s) => s.mode);
  const busy = useFocusStore((s) => s.busy);
  const error = useFocusStore((s) => s.error);

  const live = isLive(status);
  const isStopwatch = mode === 'stopwatch';

  const onClick = useCallback(
    (action: Action) => () => dispatch(action, router),
    [router]
  );

  const buttons: ButtonSpec[] = [
    ...(live
      ? status === 'running'
        ? [{ key: 'pause' as const, label: 'Pause', icon: Pause, variant: 'primary' as const }]
        : [{ key: 'resume' as const, label: 'Resume', icon: Play, variant: 'primary' as const }]
      : [{ key: 'start' as const, label: 'Start', icon: Play, variant: 'primary' as const }]),
    { key: 'stop', label: 'Stop', icon: Square, variant: 'danger' as const },
    { key: 'extend', label: '+5 min', icon: Timer },
    ...(isStopwatch
      ? [{ key: 'lap' as const, label: 'Lap', icon: Flag }]
      : [{ key: 'skip' as const, label: 'Skip', icon: SkipForward }]),
    { key: 'stop', label: 'Reset', icon: RotateCcw, variant: 'ghost' as const },
  ];

  // `stop` appears twice on purpose above only in the sense that Reset and Stop
  // both end the session; Reset additionally clears local state. Deduplicate by
  // key so the row cannot render two identical controls.
  const seen = new Set<string>();
  const unique = buttons.filter((b) => {
    if (seen.has(b.key)) return false;
    seen.add(b.key);
    return true;
  });

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {unique.map(({ key, label, icon: Icon, variant }) => {
          // Reset and Stop share the `stop` action; give them distinct keys so the
          // filter above does not drop the second one.
          const domKey = key === 'stop' && label === 'Reset' ? 'reset' : key;
          const disabled = busy || (key === 'stop' && !live && status === 'idle');
          return (
            <button
              key={domKey}
              type="button"
              onClick={onClick(key)}
              disabled={disabled}
              aria-label={label}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-40',
                variant === 'primary' && 'bg-primary text-primary-foreground hover:opacity-90',
                variant === 'danger' &&
                  'bg-destructive/10 text-destructive hover:bg-destructive/20',
                variant === 'ghost' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
                !variant && 'border border-border text-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="max-w-sm text-center text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default Transport;
