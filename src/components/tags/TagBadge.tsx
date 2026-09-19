"use client";

/**
 * TagBadge — a compact pill that renders a tag label with an optional remove
 * button. When a hex `color` is provided the badge is tinted with a translucent
 * version of it (text + border + background derived from the color).
 *
 * Usage:
 *   <TagBadge label="focus" color="#3b82f6" onRemove={() => remove('focus')} />
 */
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TagBadgeProps {
  /** Tag label text. */
  label: string;
  /** Optional hex color (e.g. #3b82f6) used to tint the badge. */
  color?: string | null;
  /** When provided, renders an X button that calls this handler. */
  onRemove?: () => void;
  className?: string;
}

export default function TagBadge({ label, color, onRemove, className }: TagBadgeProps) {
  const tinted = color
    ? { backgroundColor: `${color}1f`, borderColor: `${color}66`, color }
    : undefined;

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700',
        className,
      )}
      style={tinted}
    >
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="rounded-full p-0.5 text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}