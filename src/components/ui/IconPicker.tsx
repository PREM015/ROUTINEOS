"use client";

/**
 * IconPicker — a grid of lucide-react icons for visual selection. The
 * `value` prop holds the icon name string, `onChange` reports the picked
 * name, and `icons` lets callers restrict the offered subset.
 *
 * Usage:
 *   <IconPicker value={icon} onChange={setIcon} />
 */
import * as React from 'react';
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  Calendar,
  Circle,
  Coffee,
  Dumbbell,
  Flame,
  Heart,
  Layers,
  Moon,
  PenLine,
  Plus,
  Rocket,
  Settings,
  Sparkles,
  Star,
  Sunrise,
  Target,
  Timer,
  TrendingUp,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IconOption {
  name: string;
  component: LucideIcon;
}

export const DEFAULT_ICONS: readonly IconOption[] = [
  { name: 'target', component: Target },
  { name: 'flame', component: Flame },
  { name: 'star', component: Star },
  { name: 'heart', component: Heart },
  { name: 'zap', component: Zap },
  { name: 'sparkles', component: Sparkles },
  { name: 'trending-up', component: TrendingUp },
  { name: 'timer', component: Timer },
  { name: 'dumbbell', component: Dumbbell },
  { name: 'sunrise', component: Sunrise },
  { name: 'moon', component: Moon },
  { name: 'activity', component: Activity },
  { name: 'award', component: Award },
  { name: 'book-open', component: BookOpen },
  { name: 'calendar', component: Calendar },
  { name: 'circle', component: Circle },
  { name: 'coffee', component: Coffee },
  { name: 'layers', component: Layers },
  { name: 'bell', component: Bell },
  { name: 'pen-line', component: PenLine },
  { name: 'plus', component: Plus },
  { name: 'rocket', component: Rocket },
  { name: 'settings', component: Settings },
  { name: 'user', component: User },
];

export interface IconPickerProps {
  /** Currently selected icon name; matches `icon.name`. */
  value: string;
  onChange: (name: string) => void;
  /** Subset of icons to offer. Defaults to {@link DEFAULT_ICONS}. */
  icons?: readonly IconOption[];
  disabled?: boolean;
  className?: string;
}

export function IconPicker({
  value,
  onChange,
  icons = DEFAULT_ICONS,
  disabled = false,
  className,
}: IconPickerProps) {
  return (
    <div className={cn('grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-6', className)}>
      {icons.map((icon) => {
        const IconComp = icon.component;
        const selected = icon.name === value;
        return (
          <button
            key={icon.name}
            type="button"
            disabled={disabled}
            onClick={() => onChange(icon.name)}
            title={icon.name}
            aria-label={`Select icon ${icon.name}`}
            aria-pressed={selected}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? 'border-blue-600 bg-blue-50 text-blue-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900',
            )}
          >
            <IconComp className="h-5 w-5" />
          </button>
        );
      })}
    </div>
  );
}