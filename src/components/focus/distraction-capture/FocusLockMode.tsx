'use client';

import { useCallback, useEffect, useState } from 'react';
import { Minimize2, Bell, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusStore } from '@/store/focus.store';
import { useFocusRuntime } from '@/hooks/useFocusRuntime';

interface FocusLockModeProps {
  children: React.ReactNode;
  className?: string;
}

export function FocusLockMode({ children, className }: FocusLockModeProps) {
  const status = useFocusStore((s) => s.status);
  const mode = useFocusStore((s) => s.mode);
  const intent = useFocusStore((s) => s.intent);
  const actualStartTime = useFocusStore((s) => s.actualStartTime);
  const startCheckInState = useFocusStore((s) => s.startCheckInState);
  const adoption = useFocusStore((s) => s.adopt);

  const runtime = useFocusRuntime();
  const [isLocked, setIsLocked] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showControls, setShowControls] = useState(true);

  const live = status === 'running' || status === 'paused';

  // Auto-hide controls after 3 seconds of inactivity
  useEffect(() => {
    if (!isLocked || !live) return;
    const timer = setTimeout(() => setShowControls(false), 3000);
    return () => clearTimeout(timer);
  }, [isLocked, live, showControls]);

  const handleMouseMove = useCallback(() => {
    if (isLocked && live) setShowControls(true);
  }, [isLocked, live]);

  const toggleLock = useCallback(() => {
    setIsLocked((prev) => !prev);
    if (!isLocked) setShowControls(true);
  }, [isLocked]);

  const toggleNotifications = useCallback(() => {
    setNotificationsEnabled((prev) => !prev);
    // In a real implementation, this would update user settings
    adoption({ /* notification preference would go here */ });
  }, [adoption]);

  const handlePause = useCallback(async () => {
    if (live && runtime) await runtime.pause();
  }, [live, runtime]);

  const handleResume = useCallback(async () => {
    if (status === 'paused' && runtime) await runtime.resume();
  }, [status, runtime]);

  if (!live) return <>{children}</>;

  return (
    <div
      className={cn('relative', className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => isLocked && live && setShowControls(false)}
    >
      {children}

      {/* Lock Mode Overlay */}
      {isLocked && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm transition-opacity duration-300"
          style={{ opacity: showControls ? 1 : 0.3 }}
          onClick={() => setShowControls(true)}
        >
          {showControls && (
            <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8">
              {/* Top bar with lock controls */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleLock}
                  className="tap-target p-2 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
                  aria-label="Exit focus lock"
                >
                  <Minimize2 className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={toggleNotifications}
                  className="tap-target p-2 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
                  aria-label={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
                >
                  {notificationsEnabled ? (
                    <Bell className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <BellOff className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Session info card */}
              <div className="w-full max-w-md glass-panel glass-panel-lift p-6 rounded-2xl text-center">
                <div className="mb-4 flex items-center justify-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {mode === 'focus' ? 'Deep Work' : mode.replace('-', ' ')}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-focus/15 px-2 py-0.5 text-xs font-semibold text-accent-focus">
                    {status === 'running' ? 'Active' : 'Paused'}
                  </span>
                </div>

                <h2 className="text-lg font-medium text-foreground truncate mb-2">{intent || 'Focus session'}</h2>

                {actualStartTime && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Started at {new Date(actualStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {startCheckInState === 'confirmed' && ' · Confirmed'}
                    {startCheckInState === 'skipped' && ' · Check-in skipped'}
                  </p>
                )}

                <div className="flex items-center justify-center gap-3">
                  {status === 'running' ? (
                    <button
                      type="button"
                      onClick={handlePause}
                      className="tap-target px-6 py-2.5 rounded-full bg-destructive/10 text-destructive font-medium hover:bg-destructive/20 transition-colors"
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResume}
                      className="tap-target px-6 py-2.5 rounded-full bg-accent-focus/10 text-accent-focus font-medium hover:bg-accent-focus/20 transition-colors"
                    >
                      Resume
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={toggleLock}
                    className="tap-target px-6 py-2.5 rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    Exit Lock
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FocusLockMode;