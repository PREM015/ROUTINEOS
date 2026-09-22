'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';

interface ThemeToggleProps {
  variant?: 'icon' | 'segmented';
}

/**
 * Theme toggle (light / dark / system). Renders a placeholder until mounted
 * so the server HTML matches and no hydration mismatch occurs. The choice
 * persists via next-themes (localStorage) with no flash on load.
 */
export function ThemeToggle({ variant = 'icon' }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Mount sync: next-themes resolves the theme client-side only. Rendering a
  // placeholder until then keeps server/client HTML identical.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount sync to avoid hydration mismatch
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className={
          variant === 'icon'
            ? 'inline-block h-9 w-9 rounded-lg bg-muted/60'
            : 'inline-block h-9 w-52 rounded-lg bg-muted/60'
        }
      />
    );
  }

  if (variant === 'segmented') {
    const options = [
      { value: 'light', label: 'Light', Icon: Sun },
      { value: 'dark', label: 'Dark', Icon: Moon },
      { value: 'system', label: 'System', Icon: Monitor },
    ] as const;
    return (
      <div
        role="radiogroup"
        aria-label="Color theme"
        className="inline-flex gap-1 rounded-xl border border-border bg-muted/50 p-1"
      >
        {options.map(({ value, label, Icon }) => {
          const selected = theme === value;
          return (
            <button
              key={value}
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                selected
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  const isDark = resolvedTheme === 'dark';
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
      ) : (
        <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}

export default ThemeToggle;
