import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TILE_SIZES = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
} as const;

const WORD_SIZES = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
} as const;

/**
 * RoutineOS logo: a progress-ring/check mark in a gradient tile plus wordmark.
 * Uses theme tokens so it works in light and dark mode.
 */
export function Logo({ variant = 'full', size = 'md', className }: LogoProps) {
  return (
    <span className={cn('group inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 transition-shadow duration-300 ease-out-expo group-hover:shadow-[0_0_26px_-4px_rgba(16,185,129,0.7)]',
          TILE_SIZES[size]
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3/5 w-3/5"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {variant === 'full' && (
        <span
          className={cn(
            'chromatic-edge font-bold tracking-tight text-foreground',
            WORD_SIZES[size]
          )}
        >
          RoutineOS
        </span>
      )}
    </span>
  );
}

export default Logo;
